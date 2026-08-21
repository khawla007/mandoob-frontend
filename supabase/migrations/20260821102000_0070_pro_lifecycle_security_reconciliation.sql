-- Finalize normalized PRO lifecycle authorization and assignment linkage.
begin;

create or replace function public.has_current_pro_credential(p_pro_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pro_credentials credential
    where credential.pro_profile_id = p_pro_profile_id
      and credential.credential_type = 'pro_license'
      and credential.state = 'verified'
      and credential.expiry_date >= timezone('Asia/Dubai', pg_catalog.now())::date
  );
$$;

create or replace function public.has_company_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.status = 'active'
      and (
        (profile.role in ('admin', 'super_admin') and profile.tenant_id is null)
        or (profile.role in ('customer', 'employee') and profile.tenant_id = p_tenant_id)
        or (
          profile.role = 'pro'
          and public.has_current_pro_credential(profile.id)
          and exists (
            select 1 from public.pro_company_assignments assignment
            where assignment.pro_profile_id = profile.id
              and assignment.tenant_id = p_tenant_id
              and assignment.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.authorize_pro_company_access(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.pro_company_assignments assignment
      on assignment.pro_profile_id = profile.id
    where profile.id = p_actor_id
      and profile.role = 'pro'
      and profile.status = 'active'
      and assignment.tenant_id = p_tenant_id
      and assignment.status = 'active'
      and (p_company_id is null or assignment.company_id = p_company_id)
      and public.has_current_pro_credential(profile.id)
  );
$$;

create or replace function public.read_authoritative_pro_tenant(p_actor_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select assignment.tenant_id
  from public.profiles profile
  join public.pro_company_assignments assignment on assignment.pro_profile_id = profile.id
  where profile.id = p_actor_id
    and profile.role = 'pro'
    and profile.status = 'active'
    and assignment.status = 'active'
    and public.has_current_pro_credential(profile.id)
  limit 1;
$$;

create or replace function public.raise_pro_assignment_eligibility_error(p_result jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_code text := p_result -> 'codes' ->> 0;
  v_error text;
begin
  if coalesce((p_result ->> 'eligible')::boolean, false) then return; end if;
  v_error := case
    when v_code = 'PRO_ACCOUNT_INACTIVE' then 'PRO_INACTIVE'
    when v_code in (
      'PRO_CREDENTIAL_MISSING', 'PRO_CREDENTIAL_DRAFT', 'PRO_CREDENTIAL_SUBMITTED',
      'PRO_CREDENTIAL_UNDER_REVIEW', 'PRO_CREDENTIAL_REJECTED',
      'PRO_CREDENTIAL_EXPIRED', 'PRO_CREDENTIAL_REVOKED'
    ) then 'PRO_NOT_VERIFIED'
    when v_code = 'PRICING_TERMS_MISSING' then 'PRO_PRICING_NOT_CONFIGURED'
    when v_code = 'COMPENSATION_TERMS_MISSING' then 'PRO_COMPENSATION_NOT_CONFIGURED'
    when v_code in (
      'PRO_ALREADY_ASSIGNED', 'COMPANY_ALREADY_ASSIGNED', 'COMPANY_INACTIVE'
    ) then v_code
    else 'PRO_NOT_VERIFIED'
  end;
  raise exception using errcode = 'P0001', message = v_error;
end;
$$;

create or replace function public.assign_pro_to_company(
  p_company_id uuid,
  p_pro_profile_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_assignment_id uuid;
  v_target_tenant_status text;
  v_eligibility jsonb;
  v_pricing_term_id uuid;
  v_compensation_term_id uuid;
begin
  perform 1 from public.profiles
  where id = p_actor_profile_id and role in ('admin', 'super_admin')
    and status = 'active' and tenant_id is null for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_pro_profile_id]);
  select tenant_id, status into v_tenant_id, v_company_status
  from public.company_profiles where id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY'; end if;
  select status into v_tenant_status from public.tenants where id = v_tenant_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY'; end if;
  if v_tenant_status = 'suspended' or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;
  if v_tenant_status not in ('pending', 'unassigned', 'active') then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;

  perform 1 from public.profiles
  where id = p_pro_profile_id and role = 'pro' and status = 'active' for update;
  if not found then raise exception using errcode = 'P0001', message = 'PRO_INACTIVE'; end if;
  perform 1 from public.pro_company_assignments
  where pro_profile_id = p_pro_profile_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED'; end if;
  perform 1 from public.pro_company_assignments
  where company_id = p_company_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'COMPANY_ALREADY_ASSIGNED'; end if;

  v_eligibility := public.evaluate_pro_assignment_eligibility(p_pro_profile_id, null);
  perform public.raise_pro_assignment_eligibility_error(v_eligibility);
  v_pricing_term_id := (v_eligibility ->> 'pricingTermId')::uuid;
  v_compensation_term_id := (v_eligibility ->> 'compensationTermId')::uuid;

  insert into public.pro_company_assignments (
    tenant_id, company_id, pro_profile_id, assigned_by
  ) values (v_tenant_id, p_company_id, p_pro_profile_id, p_actor_profile_id)
  returning id into v_assignment_id;
  insert into public.pro_assignment_term_links (
    assignment_id, pricing_term_id, compensation_term_id, linked_by
  ) values (
    v_assignment_id, v_pricing_term_id, v_compensation_term_id, p_actor_profile_id
  );

  update public.profiles set tenant_id = v_tenant_id, updated_at = pg_catalog.now()
  where id = p_pro_profile_id;
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('tenant_id', v_tenant_id),
    updated_at = pg_catalog.now()
  where id = p_pro_profile_id;
  v_target_tenant_status := case
    when v_company_status in ('active', 'renewal_due', 'renewal_overdue') then 'active'
    when v_company_status = 'onboarding' then 'pending'
    else 'pending'
  end;
  update public.tenants set status = v_target_tenant_status, updated_at = pg_catalog.now()
  where id = v_tenant_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (v_tenant_id, p_actor_profile_id, 'company_pro_assigned', 'admin',
    pg_catalog.jsonb_build_object('assignment_id', v_assignment_id,
      'company_id', p_company_id, 'pro_profile_id', p_pro_profile_id));
  return v_assignment_id;
end;
$$;

create or replace function public.reassign_company_pro(
  p_company_id uuid,
  p_expected_assignment_id uuid,
  p_replacement_pro_profile_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assignment_id uuid;
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_old_pro_profile_id uuid;
  v_lock_old_pro_profile_id uuid;
  v_new_assignment_id uuid;
  v_reason text;
  v_target_tenant_status text;
  v_eligibility jsonb;
  v_pricing_term_id uuid;
  v_compensation_term_id uuid;
begin
  v_reason := pg_catalog.btrim(p_reason);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_RELEASE_REASON';
  end if;
  perform 1 from public.profiles
  where id = p_actor_profile_id and role in ('admin', 'super_admin')
    and status = 'active' and tenant_id is null for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  perform public.lock_company_assignment_resources(p_company_id, array[]::uuid[]);
  select pro_profile_id into v_lock_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id and status = 'active';
  perform public.lock_company_assignment_resources(
    p_company_id, array[v_lock_old_pro_profile_id, p_replacement_pro_profile_id]
  );
  select tenant_id, status into v_tenant_id, v_company_status
  from public.company_profiles where id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND'; end if;
  select status into v_tenant_status from public.tenants where id = v_tenant_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY'; end if;
  if v_tenant_status = 'suspended' or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;

  select id, pro_profile_id into v_old_assignment_id, v_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id and status = 'active' for update;
  if not found then
    if exists (select 1 from public.pro_company_assignments where company_id = p_company_id) then
      raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
    end if;
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_old_assignment_id <> p_expected_assignment_id then
    raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
  end if;
  if v_old_pro_profile_id = p_replacement_pro_profile_id then
    raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED';
  end if;

  perform 1 from public.profiles
  where id in (v_old_pro_profile_id, p_replacement_pro_profile_id)
  order by id for update;
  perform 1 from public.profiles
  where id = p_replacement_pro_profile_id and role = 'pro' and status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'PRO_INACTIVE'; end if;
  perform 1 from public.pro_company_assignments
  where pro_profile_id = p_replacement_pro_profile_id and status = 'active' for update;
  if found then raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED'; end if;
  v_eligibility := public.evaluate_pro_assignment_eligibility(
    p_replacement_pro_profile_id, null
  );
  perform public.raise_pro_assignment_eligibility_error(v_eligibility);
  v_pricing_term_id := (v_eligibility ->> 'pricingTermId')::uuid;
  v_compensation_term_id := (v_eligibility ->> 'compensationTermId')::uuid;

  update public.pro_company_assignments set status = 'released',
    released_at = pg_catalog.now(), released_by = p_actor_profile_id,
    release_reason = v_reason, updated_at = pg_catalog.now()
  where id = v_old_assignment_id;
  update public.profiles set tenant_id = null, updated_at = pg_catalog.now()
  where id = v_old_pro_profile_id;
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'tenant_id',
    updated_at = pg_catalog.now() where id = v_old_pro_profile_id;

  insert into public.pro_company_assignments (
    tenant_id, company_id, pro_profile_id, assigned_by
  ) values (
    v_tenant_id, p_company_id, p_replacement_pro_profile_id, p_actor_profile_id
  ) returning id into v_new_assignment_id;
  insert into public.pro_assignment_term_links (
    assignment_id, pricing_term_id, compensation_term_id, linked_by
  ) values (
    v_new_assignment_id, v_pricing_term_id, v_compensation_term_id, p_actor_profile_id
  );
  update public.profiles set tenant_id = v_tenant_id, updated_at = pg_catalog.now()
  where id = p_replacement_pro_profile_id;
  update auth.users set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('tenant_id', v_tenant_id),
    updated_at = pg_catalog.now()
  where id = p_replacement_pro_profile_id;
  v_target_tenant_status := case
    when v_company_status in ('active', 'renewal_due', 'renewal_overdue') then 'active'
    when v_company_status = 'onboarding' then 'pending'
    else 'pending'
  end;
  update public.tenants set status = v_target_tenant_status, updated_at = pg_catalog.now()
  where id = v_tenant_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values
    (v_tenant_id, p_actor_profile_id, 'company_pro_released', 'admin',
      pg_catalog.jsonb_build_object('assignment_id', v_old_assignment_id,
        'company_id', p_company_id, 'pro_profile_id', v_old_pro_profile_id,
        'reason', v_reason, 'replacement_assignment_id', v_new_assignment_id)),
    (v_tenant_id, p_actor_profile_id, 'company_pro_assigned', 'admin',
      pg_catalog.jsonb_build_object('assignment_id', v_new_assignment_id,
        'company_id', p_company_id, 'pro_profile_id', p_replacement_pro_profile_id,
        'replaces_assignment_id', v_old_assignment_id));
  return v_new_assignment_id;
end;
$$;

-- Replace legacy verification checks in accepted onboarding/company functions.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_replaced text;
begin
  foreach v_signature in array array[
    'public.prepare_company_onboarding_operation(uuid,uuid,uuid,bigint,uuid,text)'::regprocedure,
    'public.evaluate_company_activation_readiness(uuid)'::regprocedure,
    'public.read_company_onboarding(uuid,uuid,uuid)'::regprocedure,
    'public.update_assigned_company_profile(uuid,uuid,uuid,timestamptz,text,text,text,date)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
    v_replaced := pg_catalog.replace(
      v_definition,
      'and pro.credentials_verified = true',
      'and public.has_current_pro_credential(assignment.pro_profile_id)'
    );
    v_replaced := pg_catalog.replace(
      v_replaced,
      'and credentials_verified = true',
      'and public.has_current_pro_credential(p_actor_profile_id)'
    );
    if v_replaced = v_definition then
      raise exception 'LEGACY_CREDENTIAL_FUNCTION_REWRITE_MISSED: %', v_signature;
    end if;
    execute v_replaced;
  end loop;
end;
$$;

do $$
declare
  v_signature regprocedure :=
    'public.admin_change_role_atomic(uuid,uuid,text,uuid,text,uuid,jsonb,text)'::regprocedure;
  v_definition text;
  v_replaced text;
begin
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
  v_replaced := pg_catalog.replace(
    v_definition,
$legacy$    insert into public.pro_profiles (
      profile_id, license_no_encrypted, designation, department, service_areas, bio,
      credentials_verified, verified_at, verified_by_profile_id
    ) values (
      p_target_id, p_role_data ->> 'license_no_encrypted', p_role_data ->> 'designation',
      p_role_data ->> 'department', coalesce(p_role_data -> 'service_areas', '[]'::jsonb),
      p_role_data ->> 'bio', false, null, null
    );$legacy$,
$normalized$    insert into public.pro_profiles (
      profile_id, designation, department, service_areas, bio
    ) values (
      p_target_id, p_role_data ->> 'designation', p_role_data ->> 'department',
      coalesce(p_role_data -> 'service_areas', '[]'::jsonb), p_role_data ->> 'bio'
    );$normalized$
  );
  if v_replaced = v_definition then
    raise exception 'LEGACY_ROLE_FUNCTION_REWRITE_MISSED';
  end if;
  execute v_replaced;
end;
$$;
alter function public.admin_change_role_atomic(
  uuid, uuid, text, uuid, text, uuid, jsonb, text
) set search_path = '';

drop function if exists public.verify_pro_credentials_atomic(uuid, uuid, timestamptz);
alter table public.pro_profiles drop constraint if exists pro_profiles_credentials_consistent;
alter table public.pro_profiles drop constraint if exists pro_profiles_verified_by_profile_id_fkey;
alter table public.pro_profiles
  drop column license_no_encrypted,
  drop column credentials_verified,
  drop column verified_at,
  drop column verified_by_profile_id;

alter table public.pro_credentials enable row level security;
alter table public.pro_credential_evidence enable row level security;
alter table public.pro_credential_decisions enable row level security;
alter table public.pro_commercial_terms enable row level security;
alter table public.pro_commercial_term_events enable row level security;
alter table public.pro_assignment_term_links enable row level security;
revoke all on table public.pro_credentials from public, anon, authenticated;
revoke all on table public.pro_credential_evidence from public, anon, authenticated;
revoke all on table public.pro_credential_decisions from public, anon, authenticated;
revoke all on table public.pro_commercial_terms from public, anon, authenticated;
revoke all on table public.pro_commercial_term_events from public, anon, authenticated;
revoke all on table public.pro_assignment_term_links from public, anon, authenticated;
revoke all on table public.pro_credentials from service_role;
revoke all on table public.pro_credential_evidence from service_role;
revoke all on table public.pro_credential_decisions from service_role;
revoke all on table public.pro_commercial_terms from service_role;
revoke all on table public.pro_commercial_term_events from service_role;
revoke all on table public.pro_assignment_term_links from service_role;
revoke all on table public.pro_lifecycle_operation_receipts from service_role;
grant select on table public.pro_credentials to service_role;
grant select on table public.pro_credential_evidence to service_role;
grant select on table public.pro_credential_decisions to service_role;
grant select on table public.pro_commercial_terms to service_role;
grant select on table public.pro_commercial_term_events to service_role;
grant select on table public.pro_assignment_term_links to service_role;

alter function public.has_current_pro_credential(uuid) owner to postgres;
alter function public.authorize_pro_company_access(uuid, uuid, uuid) owner to postgres;
alter function public.read_authoritative_pro_tenant(uuid) owner to postgres;
alter function public.has_company_access(uuid) owner to postgres;
alter function public.raise_pro_assignment_eligibility_error(jsonb) owner to postgres;
alter function public.assign_pro_to_company(uuid, uuid, uuid) owner to postgres;
alter function public.reassign_company_pro(uuid, uuid, uuid, text, uuid) owner to postgres;
revoke all on function public.has_current_pro_credential(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_pro_company_access(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.read_authoritative_pro_tenant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.raise_pro_assignment_eligibility_error(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.has_company_access(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_pro_to_company(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_company_access(uuid) to authenticated, service_role;
grant execute on function public.authorize_pro_company_access(uuid, uuid, uuid) to service_role;
grant execute on function public.read_authoritative_pro_tenant(uuid) to service_role;
grant execute on function public.assign_pro_to_company(uuid, uuid, uuid) to service_role;
grant execute on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid) to service_role;

commit;
