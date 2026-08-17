begin;

alter table public.employees
  add column passport_no_hash text null;

alter table public.employees
  add constraint employees_passport_no_hash_shape check (
    passport_no_hash is null or passport_no_hash ~ '^[a-f0-9]{64}$'
  );

revoke insert, update, delete on table public.employees
  from public, anon, authenticated;
drop policy if exists employees_pro_write on public.employees;

-- Existing development rows remain null because the application encryption key is
-- intentionally unavailable to SQL migrations. Development data is disposable;
-- seed/reset will populate hashes through the current application write paths.
create unique index employee_company_passport_hash_unique
  on public.employees (company_id, passport_no_hash)
  where passport_no_hash is not null;

create or replace function public.update_employee_self_passport(
  p_actor_profile_id uuid,
  p_expected_tenant_id uuid,
  p_expected_company_id uuid,
  p_passport_no_encrypted text,
  p_passport_no_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
begin
  if (p_passport_no_encrypted is null) is distinct from (p_passport_no_hash is null)
    or (p_passport_no_hash is not null and p_passport_no_hash !~ '^[a-f0-9]{64}$') then
    raise exception using errcode = '22023', message = 'INVALID_PASSPORT_PAYLOAD';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_profile_id
    and tenant_id = p_expected_tenant_id
    and role::text = 'employee'
    and status::text = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'EMPLOYEE_SCOPE_MISMATCH';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = p_actor_profile_id
    and tenant_id = p_expected_tenant_id
    and company_id = p_expected_company_id
    and status::text = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'EMPLOYEE_SCOPE_MISMATCH';
  end if;

  update public.employees
  set passport_no_encrypted = p_passport_no_encrypted,
      passport_no_hash = p_passport_no_hash
  where id = v_employee_id
    and profile_id = p_actor_profile_id
    and tenant_id = p_expected_tenant_id
    and company_id = p_expected_company_id
    and status::text = 'active'
  returning id into v_employee_id;
  if not found then
    raise exception using errcode = '42501', message = 'EMPLOYEE_SCOPE_MISMATCH';
  end if;

  return v_employee_id;
end;
$$;

revoke all on function public.update_employee_self_passport(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_employee_self_passport(uuid, uuid, uuid, text, text)
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
      tenant_id, company_id, profile_id, name, email, phone,
      passport_no_encrypted, passport_no_hash, visa_no_encrypted, visa_expiry,
      emirates_id_encrypted, eid_expiry, status
    ) values (
      p_new_tenant_id, employee_company_id, p_target_id,
      coalesce(nullif(p_role_data ->> 'name', ''), 'Unnamed'), nullif(p_role_data ->> 'email', ''),
      nullif(p_role_data ->> 'phone', ''), p_role_data ->> 'passport_no_encrypted',
      nullif(p_role_data ->> 'passport_no_hash', ''), p_role_data ->> 'visa_no_encrypted',
      nullif(p_role_data ->> 'visa_expiry', '')::date, p_role_data ->> 'emirates_id_encrypted',
      nullif(p_role_data ->> 'eid_expiry', '')::date, 'active'
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

commit;
