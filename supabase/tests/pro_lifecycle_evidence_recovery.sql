\set ON_ERROR_STOP on
set statement_timeout = '25s';

begin;

do $$
begin
  if to_regprocedure('public.recover_pro_credential_evidence_removal(uuid,uuid)') is not null
     or not has_function_privilege('service_role', 'public.claim_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.finalize_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE')
     or has_table_privilege('service_role', 'public.pro_credential_evidence_removals', 'UPDATE') then
    raise exception 'UNSAFE_RECOVERY_GRANTS';
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fence-operator-a@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('94000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fence-operator-b@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('94000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fence-pro@example.invalid', 'synthetic', now(), '{}', '{}', now(), now());
insert into public.profiles (id, role, status, full_name) values
  ('94000000-0000-4000-8000-000000000001', 'admin', 'active', 'Fence Operator A'),
  ('94000000-0000-4000-8000-000000000002', 'super_admin', 'active', 'Fence Operator B'),
  ('94000000-0000-4000-8000-000000000003', 'pro', 'active', 'Fence PRO');
insert into public.pro_profiles (profile_id) values ('94000000-0000-4000-8000-000000000003');
insert into public.pro_credentials (id, pro_profile_id, state, version, submitted_at, created_by)
select id, '94000000-0000-4000-8000-000000000003', 'rejected', 0, now(), '94000000-0000-4000-8000-000000000003'
from unnest(array[
  '94000000-0000-4000-8000-000000000010'::uuid,
  '94000000-0000-4000-8000-000000000020'::uuid,
  '94000000-0000-4000-8000-000000000030'::uuid,
  '94000000-0000-4000-8000-000000000040'::uuid,
  '94000000-0000-4000-8000-000000000050'::uuid
]) id;

insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values
  ('94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000010', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011', 'application/pdf', 8, repeat('1', 64), 'race.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000020', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000020/94000000-0000-4000-8000-000000000021', 'application/pdf', 8, repeat('2', 64), 'reclaim.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000031', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000030', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000030/94000000-0000-4000-8000-000000000031', 'application/pdf', 8, repeat('3', 64), 'legacy.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000041', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000040', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000040/94000000-0000-4000-8000-000000000041', 'application/pdf', 8, repeat('4', 64), 'cancelled.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003'),
  ('94000000-0000-4000-8000-000000000042', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000040', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000040/94000000-0000-4000-8000-000000000042', 'application/pdf', 8, repeat('5', 64), 'competing.pdf', 'fixture', now(), '94000000-0000-4000-8000-000000000003');

insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, lease_expires_at, created_at
) values
  ('94000000-0000-4000-8000-000000000012', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000011', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000013', repeat('a', 64), 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011', 'prepared', now() - interval '1 minute', now() - interval '20 minutes'),
  ('94000000-0000-4000-8000-000000000022', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000023', repeat('b', 64), 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000020/94000000-0000-4000-8000-000000000021', 'prepared', now() - interval '1 minute', now() - interval '20 minutes'),
  ('94000000-0000-4000-8000-000000000043', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000042', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000044', repeat('c', 64), 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000040/94000000-0000-4000-8000-000000000042', 'prepared', now() + interval '15 minutes', now());
insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, status, cancelled_at, recovery_actor_id, lease_expires_at, created_at
) values
  ('94000000-0000-4000-8000-000000000032', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000031', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000033', repeat('d', 64), 'cancelled', now() - interval '1 day', '94000000-0000-4000-8000-000000000001', now() + interval '1 day', now() - interval '2 days'),
  ('94000000-0000-4000-8000-000000000045', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000041', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000046', repeat('e', 64), 'cancelled', now() - interval '31 days', '94000000-0000-4000-8000-000000000001', now() - interval '31 days', now() - interval '32 days');
insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, status, sanitized_result, completed_at, lease_expires_at, created_at
) values (
  '94000000-0000-4000-8000-000000000052', '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000050', '94000000-0000-4000-8000-000000000051', '94000000-0000-4000-8000-000000000003', 0, '94000000-0000-4000-8000-000000000053', repeat('f', 64), 'complete', '{}'::jsonb, now() - interval '31 days', now() - interval '31 days', now() - interval '32 days'
);

insert into storage.objects (bucket_id, name) values (
  'tenant-documents', 'pro-credentials/94000000-0000-4000-8000-000000000003/94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000011'
);

do $$
declare
  v_claim jsonb;
  v_result jsonb;
  v_error text;
begin
  perform pg_catalog.set_config('app.pro_evidence_finalize', '94000000-0000-4000-8000-000000000012', true);
  update public.pro_credentials set state = 'draft', submitted_at = null
  where id = '94000000-0000-4000-8000-000000000010';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '', true);
  v_claim := public.claim_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000014'
  );
  if v_claim ->> 'status' <> 'recovering' or v_claim ->> 'storagePath' not like 'pro-credentials/%' then
    raise exception 'RECOVERY_CLAIM_INVALID';
  end if;
  delete from storage.objects where bucket_id = 'tenant-documents' and name = v_claim ->> 'storagePath';
  begin
    perform public.finalize_pro_credential_evidence_removal(
      '94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000010',
      '94000000-0000-4000-8000-000000000011', 0,
      '94000000-0000-4000-8000-000000000013', repeat('a', 64)
    );
    raise exception 'EXPECTED_OLD_FINALIZE_FENCE';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise exception 'OLD_FINALIZE_NOT_FENCED'; end if;
  delete from storage.objects where bucket_id = 'tenant-documents' and name = v_claim ->> 'storagePath';
  v_result := public.finalize_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000014'
  );
  if v_result::text like '%pro-credentials/%'
     or exists (select 1 from public.pro_credential_evidence where id = '94000000-0000-4000-8000-000000000011')
     or exists (select 1 from storage.objects where bucket_id = 'tenant-documents' and name = v_claim ->> 'storagePath')
     or not exists (
       select 1 from public.auth_events where actor_user_id = '94000000-0000-4000-8000-000000000001'
         and details ->> 'originalActorId' = '94000000-0000-4000-8000-000000000003'
         and details ->> 'recoveryActorId' = '94000000-0000-4000-8000-000000000001'
     ) then raise exception 'RECOVERY_FINALIZE_INCOMPLETE'; end if;

  update public.pro_credentials set state = 'rejected', submitted_at = now()
  where id = '94000000-0000-4000-8000-000000000010';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '94000000-0000-4000-8000-000000000022', true);
  update public.pro_credentials set state = 'draft', submitted_at = null
  where id = '94000000-0000-4000-8000-000000000020';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '', true);
  perform public.claim_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021',
    '94000000-0000-4000-8000-000000000024'
  );
  begin
    perform public.claim_pro_credential_evidence_removal_recovery(
      '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021',
      '94000000-0000-4000-8000-000000000025'
    );
    raise exception 'EXPECTED_LIVE_CLAIM_FENCE';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error <> 'EVIDENCE_REMOVAL_LEASE_ACTIVE' then raise exception 'LIVE_CLAIM_NOT_FENCED'; end if;
  perform pg_catalog.set_config('app.pro_evidence_recovery_claim', '94000000-0000-4000-8000-000000000022', true);
  update public.pro_credential_evidence_removals set lease_expires_at = now() - interval '1 minute'
  where id = '94000000-0000-4000-8000-000000000022';
  perform public.claim_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021',
    '94000000-0000-4000-8000-000000000025'
  );
  begin
    perform public.finalize_pro_credential_evidence_removal_recovery(
      '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021',
      '94000000-0000-4000-8000-000000000024'
    );
    raise exception 'EXPECTED_STALE_CLAIM_FENCE';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error <> 'EVIDENCE_REMOVAL_CLAIM_LOST' then raise exception 'STALE_CLAIM_NOT_FENCED'; end if;
  perform public.finalize_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000021',
    '94000000-0000-4000-8000-000000000025'
  );

  update public.pro_credentials set state = 'rejected', submitted_at = now()
  where id = '94000000-0000-4000-8000-000000000020';
  update public.pro_credentials set state = 'draft', submitted_at = null
  where id = '94000000-0000-4000-8000-000000000030';
  update public.profiles set status = 'disabled' where id = '94000000-0000-4000-8000-000000000003';
  perform public.claim_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000031',
    '94000000-0000-4000-8000-000000000034'
  );
  perform public.finalize_pro_credential_evidence_removal_recovery(
    '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000030', '94000000-0000-4000-8000-000000000031',
    '94000000-0000-4000-8000-000000000034'
  );
  update public.pro_credentials set state = 'rejected', submitted_at = now()
  where id = '94000000-0000-4000-8000-000000000030';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '94000000-0000-4000-8000-000000000043', true);
  update public.pro_credentials set state = 'draft', submitted_at = null
  where id = '94000000-0000-4000-8000-000000000040';
  perform pg_catalog.set_config('app.pro_evidence_finalize', '', true);
  begin
    perform public.claim_pro_credential_evidence_removal_recovery(
      '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000041',
      '94000000-0000-4000-8000-000000000047'
    );
    raise exception 'EXPECTED_COMPETING_CREDENTIAL_FENCE';
  exception when sqlstate 'P0001' then v_error := sqlerrm; end;
  if v_error <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise exception 'RAW_UNIQUE_CONFLICT'; end if;

  perform public.cleanup_pro_credential_evidence_removals();
  if exists (select 1 from public.pro_credential_evidence_removals where id = '94000000-0000-4000-8000-000000000052')
     or not exists (select 1 from public.pro_credential_evidence_removals where id = '94000000-0000-4000-8000-000000000045' and status = 'cancelled')
     or not exists (select 1 from public.pro_credential_evidence_removals where id = '94000000-0000-4000-8000-000000000043' and status = 'prepared') then
    raise exception 'UNSAFE_RETENTION_CLEANUP';
  end if;
end;
$$;

rollback;
