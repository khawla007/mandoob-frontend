-- Atomic operator workflows added after the one-company rebase. All callers use the
-- service-role client; the live actor profile is revalidated inside each transaction.
alter table public.admin_audit_actions
  alter column action type text using action::text;
alter table public.admin_audit_actions
  add constraint admin_audit_actions_action_check check (action in (
    'create_admin', 'remove_admin', 'suspend_admin', 'restore_admin',
    'change_role', 'change_status', 'reset_mfa',
    'verify_pro_credentials'
  ));

alter table public.pro_profiles
  add constraint pro_credentials_verification_shape check (
    (credentials_verified = false and verified_at is null and verified_by_profile_id is null)
    or
    (credentials_verified = true and verified_at is not null and verified_by_profile_id is not null)
  );

alter table public.pro_profiles
  drop constraint if exists pro_profiles_verified_by_profile_id_fkey;
alter table public.pro_profiles
  add constraint pro_profiles_verified_by_profile_id_fkey
  foreign key (verified_by_profile_id) references public.profiles(id) on delete restrict;

create or replace function public.set_pro_profile_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.set_pro_profile_updated_at() from public, anon, authenticated;
drop trigger if exists pro_profiles_set_updated_at on public.pro_profiles;
create trigger pro_profiles_set_updated_at
before update on public.pro_profiles
for each row execute function public.set_pro_profile_updated_at();

create or replace function public.has_company_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin', 'super_admin')
        or (p.role in ('customer', 'employee') and p.tenant_id = p_tenant_id)
        or (
          p.role = 'pro'
          and exists (
            select 1 from public.pro_profiles pro
            where pro.profile_id = p.id
              and pro.credentials_verified = true
          )
          and exists (
            select 1 from public.pro_company_assignments assignment
            where assignment.pro_profile_id = p.id
              and assignment.tenant_id = p_tenant_id
              and assignment.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function public.has_company_access(uuid)
  from public, anon, authenticated;
grant execute on function public.has_company_access(uuid)
  to authenticated, service_role;

create or replace function public.verify_pro_credentials_atomic(
  p_actor_id uuid,
  p_target_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  target_pro public.pro_profiles%rowtype;
begin
  select * into actor from public.profiles where id = p_actor_id for update;
  if not found or not (actor.role::text in ('admin', 'super_admin'))
    or not (actor.status::text = 'active') or actor.tenant_id is not null then
    raise exception using errcode = '42501', message = 'OPERATOR_FORBIDDEN';
  end if;

  select * into target_profile from public.profiles where id = p_target_id for update;
  if not found or not (target_profile.role::text = 'pro')
    or not (target_profile.status::text = 'active') then
    raise exception using errcode = '23514', message = 'PRO_NOT_READY';
  end if;
  select * into target_pro from public.pro_profiles where profile_id = p_target_id for update;
  if not found or target_pro.license_no_encrypted is null
    or pg_catalog.length(target_pro.license_no_encrypted) = 0 then
    raise exception using errcode = '23514', message = 'PRO_LICENSE_MISSING';
  end if;
  if target_pro.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'STALE_CREDENTIALS';
  end if;

  if target_pro.credentials_verified
    and target_pro.verified_at is not null
    and target_pro.verified_by_profile_id is not null then
    return jsonb_build_object(
      'credentials_verified', true,
      'verified_at', target_pro.verified_at,
      'verified_by_profile_id', target_pro.verified_by_profile_id,
      'changed', false
    );
  end if;

  update public.pro_profiles
  set credentials_verified = true,
      verified_at = pg_catalog.now(),
      verified_by_profile_id = p_actor_id
  where profile_id = p_target_id
  returning * into target_pro;

  insert into public.admin_audit_actions (actor_id, action, target_profile_id, reason)
  values (p_actor_id, 'verify_pro_credentials', p_target_id, 'Credential verification approved');

  return jsonb_build_object(
    'credentials_verified', true,
    'verified_at', target_pro.verified_at,
    'verified_by_profile_id', target_pro.verified_by_profile_id,
    'changed', true
  );
end;
$$;

revoke all on function public.verify_pro_credentials_atomic(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.verify_pro_credentials_atomic(uuid, uuid, timestamptz)
  to service_role;

create or replace function public.provision_company_workspace_atomic(
  p_actor_id uuid,
  p_company_name text,
  p_slug text,
  p_plan text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
  v_tenant_id uuid;
  v_company_id uuid;
begin
  select * into actor from public.profiles where id = p_actor_id for update;
  if not found or not (actor.role::text in ('admin', 'super_admin'))
    or not (actor.status::text = 'active') or actor.tenant_id is not null then
    raise exception using errcode = '42501', message = 'OPERATOR_FORBIDDEN';
  end if;
  if p_company_name is null
    or pg_catalog.length(pg_catalog.btrim(p_company_name)) not between 3 and 200
    or p_slug is null
    or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    or p_plan is null
    or p_plan not in ('starter', 'professional', 'enterprise') then
    raise exception using errcode = '23514', message = 'INVALID_COMPANY_WORKSPACE';
  end if;

  insert into public.tenants (name, slug, plan, status)
  values (pg_catalog.btrim(p_company_name), p_slug, p_plan, 'pending')
  returning id into v_tenant_id;

  insert into public.company_profiles (tenant_id, company_name, status)
  values (v_tenant_id, pg_catalog.btrim(p_company_name), 'onboarding')
  returning id into v_company_id;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    v_tenant_id,
    p_actor_id,
    'created',
    'admin',
    jsonb_build_object(
      'company_id', v_company_id,
      'company_name', pg_catalog.btrim(p_company_name),
      'slug', p_slug,
      'plan', p_plan
    )
  );

  return jsonb_build_object('tenant_id', v_tenant_id, 'company_id', v_company_id);
end;
$$;

revoke all on function public.provision_company_workspace_atomic(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_company_workspace_atomic(uuid, text, text, text)
  to service_role;

create or replace function public.admin_change_role_atomic(
  p_target_id uuid,
  p_actor_id uuid,
  p_expected_role text,
  p_expected_tenant_id uuid,
  p_new_role text,
  p_new_tenant_id uuid,
  p_role_data jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
  current_profile public.profiles%rowtype;
  committed_profile public.profiles%rowtype;
  employee_company_id uuid;
begin
  select * into actor from public.profiles where id = p_actor_id for update;
  if not found or not (actor.role::text in ('admin', 'super_admin'))
    or not (actor.status::text = 'active') or actor.tenant_id is not null then
    raise exception using errcode = '42501', message = 'OPERATOR_FORBIDDEN';
  end if;

  select * into current_profile from public.profiles where id = p_target_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND'; end if;
  if current_profile.role::text is distinct from p_expected_role
    or current_profile.tenant_id is distinct from p_expected_tenant_id then
    raise exception using errcode = '40001', message = 'PROFILE_CHANGED_RETRY';
  end if;
  if p_new_role not in ('admin', 'pro', 'customer', 'employee') then
    raise exception using errcode = '23514', message = 'INVALID_ROLE_TRANSITION';
  end if;
  if (p_new_role in ('admin', 'pro') and p_new_tenant_id is not null)
    or (p_new_role in ('customer', 'employee') and p_new_tenant_id is null) then
    raise exception using errcode = '23514', message = 'INVALID_TENANT_ASSIGNMENT';
  end if;
  if exists (
    select 1 from public.pro_company_assignments assignment
    where assignment.pro_profile_id = p_target_id and assignment.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'ACTIVE_PRO_COMPANY_ASSIGNMENT';
  end if;
  if p_new_tenant_id is distinct from current_profile.tenant_id and exists (
    select 1 from public.service_cases service_case
    where service_case.assigned_to = p_target_id or service_case.created_by = p_target_id
  ) then
    raise exception using errcode = '23514', message = 'PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES';
  end if;

  if p_new_role = 'employee' then
    employee_company_id := nullif(p_role_data ->> 'company_id', '')::uuid;
    if employee_company_id is null or not exists (
      select 1 from public.company_profiles
      where id = employee_company_id and tenant_id = p_new_tenant_id
    ) then raise exception using errcode = '23514', message = 'EMPLOYEE_COMPANY_TENANT_MISMATCH'; end if;
  elsif p_new_role = 'customer' and nullif(p_role_data ->> 'linked_company_id', '') is not null
    and not exists (
      select 1 from public.company_profiles
      where id = (p_role_data ->> 'linked_company_id')::uuid and tenant_id = p_new_tenant_id
    ) then raise exception using errcode = '23514', message = 'CUSTOMER_COMPANY_TENANT_MISMATCH';
  end if;

  delete from public.pro_profiles where profile_id = p_target_id;
  delete from public.customer_profiles where profile_id = p_target_id;
  delete from public.employees where profile_id = p_target_id;

  update public.profiles set role = p_new_role::public.app_role, tenant_id = p_new_tenant_id
  where id = p_target_id
  returning * into committed_profile;

  if p_new_role = 'pro' then
    insert into public.pro_profiles (
      profile_id, license_no_encrypted, designation, department, service_areas, bio,
      credentials_verified, verified_at, verified_by_profile_id
    ) values (
      p_target_id, p_role_data ->> 'license_no_encrypted', p_role_data ->> 'designation',
      p_role_data ->> 'department', coalesce(p_role_data -> 'service_areas', '[]'::jsonb),
      p_role_data ->> 'bio', false, null, null
    );
  elsif p_new_role = 'customer' then
    insert into public.customer_profiles (profile_id, nationality, passport_no_encrypted, linked_company_id)
    values (p_target_id, p_role_data ->> 'nationality', p_role_data ->> 'passport_no_encrypted',
      nullif(p_role_data ->> 'linked_company_id', '')::uuid);
  elsif p_new_role = 'employee' then
    insert into public.employees (
      tenant_id, company_id, profile_id, name, email, phone, passport_no_encrypted,
      visa_no_encrypted, visa_expiry, emirates_id_encrypted, eid_expiry, status
    ) values (
      p_new_tenant_id, employee_company_id, p_target_id,
      coalesce(nullif(p_role_data ->> 'name', ''), 'Unnamed'), nullif(p_role_data ->> 'email', ''),
      nullif(p_role_data ->> 'phone', ''), p_role_data ->> 'passport_no_encrypted',
      p_role_data ->> 'visa_no_encrypted', nullif(p_role_data ->> 'visa_expiry', '')::date,
      p_role_data ->> 'emirates_id_encrypted', nullif(p_role_data ->> 'eid_expiry', '')::date, 'active'
    );
  end if;

  insert into public.admin_audit_actions (actor_id, action, target_profile_id, reason)
  values (p_actor_id, 'change_role', p_target_id, p_reason);
  return jsonb_build_object(
    'role', committed_profile.role::text, 'tenant_id', committed_profile.tenant_id,
    'status', committed_profile.status::text, 'updated_at', committed_profile.updated_at
  );
end;
$$;

revoke all on function public.admin_change_role_atomic(uuid, uuid, text, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_change_role_atomic(uuid, uuid, text, uuid, text, uuid, jsonb, text)
  to service_role;
