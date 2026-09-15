-- One-time production recovery for the two existing PRO accounts.
-- This migration intentionally creates no commercial terms and grants company
-- access only to the uniquely identified Firm PRO account.
begin;

lock table auth.users in share row exclusive mode;
lock table public.profiles in share row exclusive mode;
lock table public.pro_profiles in share row exclusive mode;
lock table public.pro_credentials in share row exclusive mode;
lock table public.pro_company_assignments in share row exclusive mode;
lock table public.company_profiles in share row exclusive mode;

do $production_pro_access_recovery$
declare
  v_firm_pro_id uuid;
  v_nova_pro_id uuid;
  v_company_id uuid;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_credential_id uuid;
  v_assignment_id uuid;
begin
  if (
    select count(*) from public.profiles
    where role::text = 'pro' and status::text = 'active'
  ) <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_EXPECTED_TWO_ACTIVE_PROS';
  end if;

  if (
    select count(*)
    from auth.users as account
    join public.profiles as profile on profile.id = account.id
    where pg_catalog.split_part(pg_catalog.lower(account.email), '@', 2) = 'firm.mandoob.local'
      and profile.role::text = 'pro'
      and profile.status::text = 'active'
  ) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_EXPECTED_ONE_FIRM_PRO';
  end if;

  if (
    select count(*)
    from auth.users as account
    join public.profiles as profile on profile.id = account.id
    where pg_catalog.split_part(pg_catalog.lower(account.email), '@', 2) = 'nova.mandoob.local'
      and profile.role::text = 'pro'
      and profile.status::text = 'active'
  ) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_EXPECTED_ONE_NOVA_PRO';
  end if;

  if (select count(*) from public.company_profiles) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_EXPECTED_ONE_COMPANY';
  end if;

  if (
    select count(*) from public.profiles
    where role::text = 'super_admin'
      and status::text = 'active'
      and tenant_id is null
  ) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_EXPECTED_ONE_SUPER_ADMIN';
  end if;

  if exists (select 1 from public.pro_profiles)
    or exists (select 1 from public.pro_credentials)
    or exists (select 1 from public.pro_company_assignments) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_TARGET_STATE_CHANGED';
  end if;

  select profile.id into strict v_firm_pro_id
  from auth.users as account
  join public.profiles as profile on profile.id = account.id
  where pg_catalog.split_part(pg_catalog.lower(account.email), '@', 2) = 'firm.mandoob.local'
    and profile.role::text = 'pro'
    and profile.status::text = 'active';

  select profile.id into strict v_nova_pro_id
  from auth.users as account
  join public.profiles as profile on profile.id = account.id
  where pg_catalog.split_part(pg_catalog.lower(account.email), '@', 2) = 'nova.mandoob.local'
    and profile.role::text = 'pro'
    and profile.status::text = 'active';

  select id into strict v_actor_id
  from public.profiles
  where role::text = 'super_admin'
    and status::text = 'active'
    and tenant_id is null;

  select id, tenant_id into strict v_company_id, v_tenant_id
  from public.company_profiles;

  insert into public.pro_profiles (profile_id)
  values (v_firm_pro_id), (v_nova_pro_id);

  insert into public.pro_credentials (
    pro_profile_id,
    credential_type,
    identifier_ciphertext,
    identifier_hash,
    identifier_last4,
    issuing_authority,
    issue_date,
    expiry_date,
    state,
    version,
    legacy_unmasked,
    submitted_at,
    created_by
  ) values (
    v_firm_pro_id,
    'pro_license',
    null, null, null,
    'Mandoob temporary test credential',
    date '2026-09-15',
    date '2027-09-15',
    'verified',
    1,
    false,
    transaction_timestamp(),
    v_actor_id
  ) returning id into v_credential_id;

  insert into public.pro_credential_decisions (
    pro_profile_id,
    credential_id,
    event,
    from_state,
    to_state,
    actor_profile_id,
    credential_version
  ) values (
    v_firm_pro_id,
    v_credential_id,
    'verified',
    'under_review',
    'verified',
    v_actor_id,
    1
  );

  perform public.write_pro_lifecycle_audit(
    v_actor_id,
    v_firm_pro_id,
    'production_access_recovery',
    v_credential_id,
    1
  );

  insert into public.pro_company_assignments (
    tenant_id,
    company_id,
    pro_profile_id,
    assigned_by
  ) values (
    v_tenant_id,
    v_company_id,
    v_firm_pro_id,
    v_actor_id
  ) returning id into v_assignment_id;

  insert into public.tenant_audit_log (
    tenant_id,
    actor_id,
    action,
    source,
    details
  ) values (
    v_tenant_id,
    v_actor_id,
    'company_pro_assigned',
    'admin',
    pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment_id,
      'company_id', v_company_id,
      'pro_profile_id', v_firm_pro_id,
      'reason', 'production_access_recovery'
    )
  );

  if not public.authorize_pro_company_access(v_firm_pro_id, v_tenant_id, v_company_id)
    or public.read_authoritative_pro_tenant(v_firm_pro_id) is distinct from v_tenant_id then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_FIRM_ACCESS_NOT_AUTHORIZED';
  end if;

  if exists (
    select 1 from public.pro_company_assignments
    where pro_profile_id = v_nova_pro_id and status::text = 'active'
  )
    or public.read_authoritative_pro_tenant(v_nova_pro_id) is not null then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCTION_PRO_RECOVERY_NOVA_MUST_REMAIN_UNASSIGNED';
  end if;
end;
$production_pro_access_recovery$;

commit;
