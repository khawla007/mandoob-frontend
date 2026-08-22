\set ON_ERROR_STOP on
set statement_timeout = '20s';

begin;

do $$
begin
  if not has_function_privilege(
    'service_role', 'public.recover_pro_credential_evidence_removal(uuid,uuid)', 'EXECUTE'
  ) or not has_function_privilege(
    'service_role', 'public.cleanup_pro_credential_evidence_removals()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'public.recover_pro_credential_evidence_removal(uuid,uuid)', 'EXECUTE'
  ) or has_table_privilege(
    'service_role', 'public.pro_credential_evidence_removals', 'UPDATE'
  ) then
    raise exception 'INVALID_RECOVERY_PRIVILEGES';
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'recovery-operator@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('94000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'recovery-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('94000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'inactive-recovery-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('94000000-0000-4000-8000-000000000001', 'admin', 'active', 'Recovery Operator'),
  ('94000000-0000-4000-8000-000000000002', 'pro', 'active', 'Recovery PRO'),
  ('94000000-0000-4000-8000-000000000003', 'pro', 'active', 'Inactive Recovery PRO');
insert into public.pro_profiles (profile_id) values
  ('94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000003');

insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values
  ('94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000002', 'draft', 0, '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000003', 'draft', 0, '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000002', 'draft', 0, '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000002', 'draft', 0, '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000050', '94000000-0000-4000-8000-000000000002', 'draft', 0, '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000060', '94000000-0000-4000-8000-000000000002', 'draft', 0, '94000000-0000-4000-8000-000000000002');

insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values
  ('94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000010',
   'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011',
   'application/pdf', 8, repeat('1', 64), 'cancel.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000020',
   'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000020/94000000-0000-4000-8000-000000000021',
   'application/pdf', 8, repeat('2', 64), 'recover.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000031', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000030',
   'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000030/94000000-0000-4000-8000-000000000031',
   'application/pdf', 8, repeat('3', 64), 'active.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000002'),
  ('94000000-0000-4000-8000-000000000041', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000040',
   'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000040/94000000-0000-4000-8000-000000000041',
   'application/pdf', 8, repeat('4', 64), 'prepared.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000002');

insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, lease_expires_at, created_at
) values
  ('94000000-0000-4000-8000-000000000012', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000002', 0,
   '94000000-0000-4000-8000-000000000013', repeat('a', 64), 'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011', 'prepared', now() - interval '1 minute', now() - interval '20 minutes'),
  ('94000000-0000-4000-8000-000000000022', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000003', 0,
   '94000000-0000-4000-8000-000000000023', repeat('b', 64), 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000020/94000000-0000-4000-8000-000000000021', 'prepared', now() - interval '1 minute', now() - interval '20 minutes'),
  ('94000000-0000-4000-8000-000000000032', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000031', '94000000-0000-4000-8000-000000000002', 0,
   '94000000-0000-4000-8000-000000000033', repeat('c', 64), 'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000030/94000000-0000-4000-8000-000000000031', 'prepared', now() + interval '15 minutes', now()),
  ('94000000-0000-4000-8000-000000000042', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000041', '94000000-0000-4000-8000-000000000002', 0,
   '94000000-0000-4000-8000-000000000043', repeat('d', 64), 'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000040/94000000-0000-4000-8000-000000000041', 'prepared', now() - interval '31 days', now() - interval '32 days');

insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, status, sanitized_result, completed_at, lease_expires_at, created_at
) values (
  '94000000-0000-4000-8000-000000000052', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000050', '94000000-0000-4000-8000-000000000051', '94000000-0000-4000-8000-000000000002', 0,
  '94000000-0000-4000-8000-000000000053', repeat('e', 64), 'complete', '{}'::jsonb, now() - interval '31 days', now() - interval '31 days', now() - interval '32 days'
);
insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, status, cancelled_at, recovery_actor_id, lease_expires_at, created_at
) values (
  '94000000-0000-4000-8000-000000000062', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000060', '94000000-0000-4000-8000-000000000061', '94000000-0000-4000-8000-000000000002', 0,
  '94000000-0000-4000-8000-000000000063', repeat('f', 64), 'cancelled', now() - interval '31 days', '94000000-0000-4000-8000-000000000001', now() - interval '31 days', now() - interval '32 days'
);

insert into storage.objects (bucket_id, name)
values (
  'tenant-documents',
  'pro-credentials/94000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011'
);

do $$
declare
  v_result jsonb;
  v_error text;
begin
  v_result := public.recover_pro_credential_evidence_removal(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000011'
  );
  if v_result <> '{"status":"cancelled"}'::jsonb
     or v_result::text like '%pro-credentials/%'
     or not exists (select 1 from public.pro_credential_evidence where id = '94000000-0000-4000-8000-000000000011')
     or not exists (
       select 1 from public.auth_events
       where actor_user_id = '94000000-0000-4000-8000-000000000001'
         and details ->> 'action' = 'credential_evidence_removal_cancelled'
     ) then
    raise exception 'UNSAFE_CANCELLATION_RECOVERY';
  end if;

  v_result := public.prepare_pro_credential_evidence_removal(
    '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000010',
    '94000000-0000-4000-8000-000000000011', 0,
    '94000000-0000-4000-8000-000000000013', repeat('a', 64)
  );
  if v_result ->> 'status' <> 'prepared' or v_result ->> 'storagePath' not like 'pro-credentials/%'
     or not exists (
       select 1 from public.pro_credential_evidence_removals
       where id = '94000000-0000-4000-8000-000000000012'
         and status = 'prepared' and lease_expires_at > now()
     ) then
    raise exception 'ORIGINAL_OPERATION_DID_NOT_RESUME';
  end if;

  update public.profiles set status = 'inactive'
  where id = '94000000-0000-4000-8000-000000000003';
  v_result := public.recover_pro_credential_evidence_removal(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000021'
  );
  if v_result ->> 'status' <> 'complete' or v_result::text like '%pro-credentials/%'
     or exists (select 1 from public.pro_credential_evidence where id = '94000000-0000-4000-8000-000000000021')
     or not exists (
       select 1 from public.auth_events
       where actor_user_id = '94000000-0000-4000-8000-000000000001'
         and details ->> 'action' = 'credential_evidence_removal_recovered'
     ) then
    raise exception 'UNSAFE_FINALIZATION_RECOVERY';
  end if;

  begin
    perform public.recover_pro_credential_evidence_removal(
      '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000031'
    );
    raise exception 'EXPECTED_ACTIVE_LEASE_REJECTION';
  exception when sqlstate 'P0001' then
    v_error := sqlerrm;
  end;
  if v_error <> 'EVIDENCE_REMOVAL_LEASE_ACTIVE' then
    raise exception 'ACTIVE_LEASE_NOT_REJECTED: %', v_error;
  end if;

  perform public.cleanup_pro_credential_evidence_removals();
  if exists (
    select 1 from public.pro_credential_evidence_removals
    where id in ('94000000-0000-4000-8000-000000000052', '94000000-0000-4000-8000-000000000062')
  ) or not exists (
    select 1 from public.pro_credential_evidence_removals
    where id = '94000000-0000-4000-8000-000000000042' and status = 'prepared'
  ) then
    raise exception 'UNSAFE_TERMINAL_RETENTION';
  end if;
end;
$$;

rollback;
