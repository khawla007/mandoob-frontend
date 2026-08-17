begin;

create or replace function public.update_assigned_company_profile(
  p_actor_profile_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_expected_updated_at timestamptz,
  p_company_name text,
  p_trade_license_no text,
  p_jurisdiction text,
  p_license_expiry date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
  v_company_name text := btrim(p_company_name);
  v_trade_license_no text := nullif(btrim(p_trade_license_no), '');
  v_jurisdiction text := nullif(btrim(p_jurisdiction), '');
begin
  if v_company_name is null or char_length(v_company_name) not between 2 and 200
     or char_length(coalesce(v_trade_license_no, '')) > 64
     or char_length(coalesce(v_jurisdiction, '')) > 120
     or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_INPUT';
  end if;

  perform public.lock_company_assignment_resources(
    p_company_id,
    array[p_actor_profile_id]
  );

  perform 1
  from public.profiles
  where id = p_actor_profile_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.pro_profiles
  where profile_id = p_actor_profile_id
    and credentials_verified = true
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.pro_company_assignments
  where pro_profile_id = p_actor_profile_id
    and tenant_id = p_tenant_id
    and company_id = p_company_id
    and status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  select updated_at
    into v_current_updated_at
  from public.company_profiles
  where id = p_company_id
    and tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'STALE_COMPANY_PROFILE';
  end if;

  update public.company_profiles
     set company_name = v_company_name,
         trade_license_no = v_trade_license_no,
         jurisdiction = v_jurisdiction,
         license_expiry = p_license_expiry
   where id = p_company_id
     and tenant_id = p_tenant_id
  returning updated_at into v_updated_at;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    p_tenant_id,
    p_actor_profile_id,
    'updated',
    'self_serve',
    jsonb_build_object('entity', 'company_profile', 'company_id', p_company_id)
  );

  return jsonb_build_object('company_id', p_company_id, 'updated_at', v_updated_at);
end;
$$;

revoke all on function public.update_assigned_company_profile(
  uuid, uuid, uuid, timestamptz, text, text, text, date
) from public, anon, authenticated;
grant execute on function public.update_assigned_company_profile(
  uuid, uuid, uuid, timestamptz, text, text, text, date
) to service_role;

commit;
