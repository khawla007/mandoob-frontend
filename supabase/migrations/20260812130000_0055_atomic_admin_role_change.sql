-- Keep the profile row, role-specific row, and role-change audit in one transaction. External
-- auth metadata/session operations occur only after this RPC commits successfully.
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
  current_profile public.profiles%rowtype;
  committed_profile public.profiles%rowtype;
  employee_client_id uuid;
begin
  select *
  into current_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;
  if current_profile.role::text is distinct from p_expected_role
    or current_profile.tenant_id is distinct from p_expected_tenant_id
  then
    raise exception using errcode = '40001', message = 'PROFILE_CHANGED_RETRY';
  end if;
  if p_new_role not in ('admin', 'pro', 'customer', 'employee') then
    raise exception using errcode = '23514', message = 'INVALID_ROLE_TRANSITION';
  end if;
  if (p_new_role = 'admin') <> (p_new_tenant_id is null) then
    raise exception using errcode = '23514', message = 'INVALID_TENANT_ASSIGNMENT';
  end if;

  -- Recheck inside the same transaction, before any subrow/profile mutation. This is the atomic
  -- equivalent of 0054 and prevents assigned or creator history from being broken by tenant moves.
  if p_new_tenant_id is distinct from current_profile.tenant_id
    and exists (
      select 1
      from public.service_cases as service_case
      where service_case.assigned_to = p_target_id
         or service_case.created_by = p_target_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES';
  end if;

  if p_new_role = 'employee' then
    employee_client_id := nullif(p_role_data ->> 'client_id', '')::uuid;
    if employee_client_id is null or not exists (
      select 1 from public.clients
      where id = employee_client_id and tenant_id = p_new_tenant_id
    ) then
      raise exception using errcode = '23514', message = 'EMPLOYEE_CLIENT_TENANT_MISMATCH';
    end if;
  elsif p_new_role = 'customer'
    and nullif(p_role_data ->> 'linked_client_id', '') is not null
    and not exists (
      select 1 from public.clients
      where id = (p_role_data ->> 'linked_client_id')::uuid
        and tenant_id = p_new_tenant_id
    )
  then
    raise exception using errcode = '23514', message = 'CUSTOMER_CLIENT_TENANT_MISMATCH';
  end if;

  delete from public.pro_profiles where profile_id = p_target_id;
  delete from public.customer_profiles where profile_id = p_target_id;
  delete from public.employees where profile_id = p_target_id;

  update public.profiles
  set role = p_new_role::public.app_role,
      tenant_id = p_new_tenant_id
  where id = p_target_id
  returning role, tenant_id, status, updated_at
  into committed_profile.role, committed_profile.tenant_id,
    committed_profile.status, committed_profile.updated_at;

  if p_new_role = 'pro' then
    insert into public.pro_profiles (
      profile_id, license_no_encrypted, designation, department, service_areas, bio
    ) values (
      p_target_id,
      p_role_data ->> 'license_no_encrypted',
      p_role_data ->> 'designation',
      p_role_data ->> 'department',
      coalesce(p_role_data -> 'service_areas', '[]'::jsonb),
      p_role_data ->> 'bio'
    );
  elsif p_new_role = 'customer' then
    insert into public.customer_profiles (
      profile_id, nationality, passport_no_encrypted, linked_client_id
    ) values (
      p_target_id,
      p_role_data ->> 'nationality',
      p_role_data ->> 'passport_no_encrypted',
      nullif(p_role_data ->> 'linked_client_id', '')::uuid
    );
  elsif p_new_role = 'employee' then
    insert into public.employees (
      tenant_id, client_id, profile_id, name, email, phone,
      passport_no_encrypted, visa_no_encrypted, visa_expiry,
      emirates_id_encrypted, eid_expiry, status
    ) values (
      p_new_tenant_id,
      employee_client_id,
      p_target_id,
      coalesce(nullif(p_role_data ->> 'name', ''), 'Unnamed'),
      nullif(p_role_data ->> 'email', ''),
      nullif(p_role_data ->> 'phone', ''),
      p_role_data ->> 'passport_no_encrypted',
      p_role_data ->> 'visa_no_encrypted',
      nullif(p_role_data ->> 'visa_expiry', '')::date,
      p_role_data ->> 'emirates_id_encrypted',
      nullif(p_role_data ->> 'eid_expiry', '')::date,
      'active'
    );
  end if;

  insert into public.admin_audit_actions (actor_id, action, target_profile_id, reason)
  values (p_actor_id, 'change_role', p_target_id, p_reason);

  return jsonb_build_object(
    'role', committed_profile.role::text,
    'tenant_id', committed_profile.tenant_id,
    'status', committed_profile.status::text,
    'updated_at', committed_profile.updated_at
  );
end;
$$;

revoke all on function public.admin_change_role_atomic(uuid, uuid, text, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_change_role_atomic(uuid, uuid, text, uuid, text, uuid, jsonb, text)
  to service_role;
