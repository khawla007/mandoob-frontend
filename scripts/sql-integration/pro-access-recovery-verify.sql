\set ON_ERROR_STOP on

do $pro_access_recovery_verify$
declare
  v_firm_id constant uuid := '10000000-0000-4000-8000-000000000002';
  v_nova_id constant uuid := '10000000-0000-4000-8000-000000000003';
  v_actor_id constant uuid := '10000000-0000-4000-8000-000000000001';
  v_tenant_id constant uuid := '20000000-0000-4000-8000-000000000001';
  v_company_id constant uuid := '30000000-0000-4000-8000-000000000001';
begin
  if (
    select count(*)
    from auth.users as account
    join public.profiles as profile on profile.id = account.id
    where (account.id, account.email, profile.role::text, profile.full_name) in (
      (v_actor_id, 'operator@fixture.mandoob.local', 'super_admin', 'Fixture Operator'),
      (v_firm_id, 'access@firm.mandoob.local', 'pro', 'Fixture Firm PRO'),
      (v_nova_id, 'access@nova.mandoob.local', 'pro', 'Fixture Nova PRO')
    )
      and profile.status::text = 'active'
      and profile.tenant_id is null
  ) <> 3 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_SOURCE_IDENTITIES';
  end if;

  if (
    select array_agg(profile_id order by profile_id)
    from public.pro_profiles
  ) is distinct from array[v_firm_id, v_nova_id]::uuid[] then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_PROFILES';
  end if;

  if (select count(*) from public.pro_credentials) <> 1 or (
    select count(*)
    from public.pro_credentials
    where pro_profile_id = v_firm_id
      and credential_type::text = 'pro_license'
      and identifier_ciphertext is null
      and identifier_hash is null
      and identifier_last4 is null
      and issuing_authority = 'Mandoob temporary test credential'
      and issue_date = date '2026-09-15'
      and expiry_date = date '2027-09-15'
      and state::text = 'verified'
      and version = 1
      and not legacy_unmasked
      and created_by = v_actor_id
  ) <> 1 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_CREDENTIAL';
  end if;

  if (select count(*) from public.pro_credential_decisions) <> 1 or (
    select count(*)
    from public.pro_credential_decisions as decision
    join public.pro_credentials as credential on credential.id = decision.credential_id
    where decision.pro_profile_id = v_firm_id
      and decision.event::text = 'verified'
      and decision.from_state::text = 'under_review'
      and decision.to_state::text = 'verified'
      and decision.actor_profile_id = v_actor_id
      and decision.credential_version = 1
      and credential.pro_profile_id = v_firm_id
  ) <> 1 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_DECISION';
  end if;

  if (select count(*) from public.pro_company_assignments) <> 1 or (
    select count(*)
    from public.pro_company_assignments
    where tenant_id = v_tenant_id
      and company_id = v_company_id
      and pro_profile_id = v_firm_id
      and assigned_by = v_actor_id
      and status::text = 'active'
  ) <> 1 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_ASSIGNMENT';
  end if;

  if not public.authorize_pro_company_access(v_firm_id, v_tenant_id, v_company_id)
    or public.read_authoritative_pro_tenant(v_firm_id) is distinct from v_tenant_id
    or public.read_authoritative_pro_tenant(v_nova_id) is not null
    or exists (
      select 1
      from public.pro_company_assignments
      where pro_profile_id = v_nova_id and status::text = 'active'
    ) then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_AUTHORIZATION';
  end if;

  if (
    select count(*)
    from public.auth_events
    where actor_user_id = v_actor_id
      and kind::text = 'pro_lifecycle_changed'
      and details ->> 'action' = 'production_access_recovery'
      and details ->> 'targetProProfileId' = v_firm_id::text
  ) <> 1 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_LIFECYCLE_AUDIT';
  end if;

  if (
    select count(*)
    from public.tenant_audit_log
    where tenant_id = v_tenant_id
      and actor_id = v_actor_id
      and action = 'company_pro_assigned'
      and source = 'admin'
      and details ->> 'company_id' = v_company_id::text
      and details ->> 'pro_profile_id' = v_firm_id::text
      and details ->> 'reason' = 'production_access_recovery'
  ) <> 1 then
    raise exception 'PRO_ACCESS_RECOVERY_VERIFY_TENANT_AUDIT';
  end if;

  if exists (select 1 from public.pro_commercial_terms) then
    raise exception 'PRO_ACCESS_RECOVERY_CREATED_COMMERCIAL_TERMS';
  end if;
end;
$pro_access_recovery_verify$;
