\set ON_ERROR_STOP on
set statement_timeout = '25s';

-- Dedicated local P3.03 fixture only. All synthetic data/storage rows and
-- authorization changes roll back, including when psql exits on an assertion.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('94040000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p303-isolated-operator@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('94040000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p303-inactive-target@example.invalid', 'synthetic', now(), '{}', '{}', now(), now());
insert into public.profiles (id, role, status, full_name) values
  ('94040000-0000-4000-8000-000000000001', 'admin', 'active', 'Synthetic operator'),
  ('94040000-0000-4000-8000-000000000002', 'pro', 'active', 'Synthetic target');
insert into public.pro_profiles (profile_id)
values ('94040000-0000-4000-8000-000000000002');

insert into public.tenants (id, name, slug, plan, status) values
  ('94040000-0000-4000-8000-000000000003', 'Synthetic status fixture', 'p303-isolated-status', 'starter', 'suspended');
insert into public.company_profiles (id, tenant_id, company_name, status) values
  ('94040000-0000-4000-8000-000000000004', '94040000-0000-4000-8000-000000000003', 'Synthetic status fixture', 'onboarding');

do $$
declare
  v_error text;
begin
  -- Company is onboarding: tenant suspension must independently deny the read.
  begin
    perform public.read_company_onboarding(
      '94040000-0000-4000-8000-000000000001',
      '94040000-0000-4000-8000-000000000003',
      '94040000-0000-4000-8000-000000000004'
    );
    raise exception 'SUSPENDED_TENANT_ONBOARDING_READ_RETURNED';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error is distinct from 'COMPANY_NOT_FOUND' then
    raise exception 'SUSPENDED_TENANT_ISOLATION_FAILED: %', v_error;
  end if;
  update public.tenants set status = 'active'
  where id = '94040000-0000-4000-8000-000000000003';
  -- Positive control uses the same caller/company; only tenant status changes.
  if public.read_company_onboarding(
    '94040000-0000-4000-8000-000000000001',
    '94040000-0000-4000-8000-000000000003',
    '94040000-0000-4000-8000-000000000004'
  ) is null then raise exception 'ACTIVE_TENANT_ONBOARDING_CONTROL_FAILED'; end if;
  update public.company_profiles set status = 'suspended'
  where id = '94040000-0000-4000-8000-000000000004';
  v_error := null;
  begin
    perform public.read_company_onboarding(
      '94040000-0000-4000-8000-000000000001',
      '94040000-0000-4000-8000-000000000003',
      '94040000-0000-4000-8000-000000000004'
    );
    raise exception 'ACTIVE_TENANT_SUSPENDED_COMPANY_READ_RETURNED';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error is distinct from 'COMPANY_NOT_FOUND' then
    raise exception 'SUSPENDED_COMPANY_ISOLATION_FAILED: %', v_error;
  end if;
  update public.company_profiles set status = 'churned'
  where id = '94040000-0000-4000-8000-000000000004';
  v_error := null;
  begin
    perform public.read_company_onboarding(
      '94040000-0000-4000-8000-000000000001',
      '94040000-0000-4000-8000-000000000003',
      '94040000-0000-4000-8000-000000000004'
    );
    raise exception 'ACTIVE_TENANT_CHURNED_COMPANY_READ_RETURNED';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error is distinct from 'COMPANY_NOT_FOUND' then
    raise exception 'CHURNED_COMPANY_ISOLATION_FAILED: %', v_error;
  end if;
end;
$$;

-- Follow the retained rejected→draft recovery fixture setup. Evidence insertion
-- precedes the expired reservation; no lifecycle guard or trigger is disabled.
insert into public.pro_credentials (id, pro_profile_id, state, version, submitted_at, created_by)
values ('94040000-0000-4000-8000-000000000010', '94040000-0000-4000-8000-000000000002', 'rejected', 0, now(), '94040000-0000-4000-8000-000000000002');
insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values (
  '94040000-0000-4000-8000-000000000011', '94040000-0000-4000-8000-000000000002',
  '94040000-0000-4000-8000-000000000010',
  'pro-credentials/94040000-0000-4000-8000-000000000002/94040000-0000-4000-8000-000000000010/94040000-0000-4000-8000-000000000011',
  'application/pdf', 8, repeat('a', 64), 'synthetic.pdf', 'fixture', now(),
  '94040000-0000-4000-8000-000000000002'
);
insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, lease_expires_at, created_at
) values (
  '94040000-0000-4000-8000-000000000012', '94040000-0000-4000-8000-000000000002',
  '94040000-0000-4000-8000-000000000010', '94040000-0000-4000-8000-000000000011',
  '94040000-0000-4000-8000-000000000002', 0, '94040000-0000-4000-8000-000000000013', repeat('b', 64),
  'pro-credentials/94040000-0000-4000-8000-000000000002/94040000-0000-4000-8000-000000000010/94040000-0000-4000-8000-000000000011',
  'prepared', now() - interval '1 minute', now() - interval '20 minutes'
);
insert into storage.objects (bucket_id, name) values (
  'tenant-documents', 'pro-credentials/94040000-0000-4000-8000-000000000002/94040000-0000-4000-8000-000000000010/94040000-0000-4000-8000-000000000011'
);

do $$
declare
  v_claim jsonb;
  v_result jsonb;
begin
  perform pg_catalog.set_config('app.pro_evidence_finalize', '94040000-0000-4000-8000-000000000012', true);
  update public.pro_credentials set state = 'draft', submitted_at = null
  where id = '94040000-0000-4000-8000-000000000010';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '', true);
  update public.profiles set status = 'disabled'
  where id = '94040000-0000-4000-8000-000000000002';
  -- Actual public wrappers must authorize the live operator, not require the
  -- disabled original PRO to become active again in order to finish cleanup.
  v_claim := public.claim_pro_credential_evidence_removal_recovery(
    '94040000-0000-4000-8000-000000000001', '94040000-0000-4000-8000-000000000002',
    '94040000-0000-4000-8000-000000000010', '94040000-0000-4000-8000-000000000011',
    '94040000-0000-4000-8000-000000000014'
  );
  if v_claim ->> 'status' is distinct from 'recovering'
     or v_claim ->> 'storagePath' is distinct from
       'pro-credentials/94040000-0000-4000-8000-000000000002/94040000-0000-4000-8000-000000000010/94040000-0000-4000-8000-000000000011' then
    raise exception 'INACTIVE_TARGET_RECOVERY_CLAIM_INVALID';
  end if;
  perform pg_catalog.set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'tenant-documents' and name = v_claim ->> 'storagePath';
  perform pg_catalog.set_config('storage.allow_delete_query', 'false', true);
  v_result := public.finalize_pro_credential_evidence_removal_recovery(
    '94040000-0000-4000-8000-000000000001', '94040000-0000-4000-8000-000000000002',
    '94040000-0000-4000-8000-000000000010', '94040000-0000-4000-8000-000000000011',
    '94040000-0000-4000-8000-000000000014'
  );
  if v_result is null or v_result::text like '%pro-credentials/%'
     or exists (select 1 from public.pro_credential_evidence where id = '94040000-0000-4000-8000-000000000011')
     or exists (select 1 from storage.objects where bucket_id = 'tenant-documents' and name = v_claim ->> 'storagePath')
     or not exists (select 1 from public.pro_credential_evidence_removals
       where id = '94040000-0000-4000-8000-000000000012' and status = 'complete')
     or not exists (select 1 from public.pro_credentials
       where id = '94040000-0000-4000-8000-000000000010' and state = 'draft' and version = 1)
     or not exists (select 1 from public.profiles
       where id = '94040000-0000-4000-8000-000000000002' and status = 'disabled')
     or not exists (select 1 from public.auth_events
       where actor_user_id = '94040000-0000-4000-8000-000000000001'
         and details ->> 'originalActorId' = '94040000-0000-4000-8000-000000000002'
         and details ->> 'recoveryActorId' = '94040000-0000-4000-8000-000000000001') then
    raise exception 'INACTIVE_TARGET_RECOVERY_FINALIZE_INCOMPLETE';
  end if;
end;
$$;

rollback;
