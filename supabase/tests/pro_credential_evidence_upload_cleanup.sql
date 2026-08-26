\set ON_ERROR_STOP on
set statement_timeout = '15s';
begin;

do $$ begin
  if has_function_privilege(
    'service_role',
    'public.register_pro_credential_evidence(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)',
    'EXECUTE'
  ) then raise exception 'HISTORICAL_REGISTER_STILL_EXECUTABLE'; end if;
  if has_function_privilege(
    'authenticated', 'public.claim_pro_credential_evidence_upload_cleanup(uuid,integer)', 'EXECUTE'
  ) or not has_function_privilege(
    'service_role', 'public.claim_pro_credential_evidence_upload_cleanup(uuid,integer)', 'EXECUTE'
  ) then raise exception 'CLEANUP_RPC_PRIVILEGES_INVALID'; end if;
end $$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '96000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'upload-cleanup@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name) values
  ('96000000-0000-4000-8000-000000000001', 'pro', 'active', 'Upload Cleanup PRO');
insert into public.pro_profiles (profile_id) values
  ('96000000-0000-4000-8000-000000000001');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values
  ('96000000-0000-4000-8000-000000000010',
   '96000000-0000-4000-8000-000000000001', 'draft', 0,
   '96000000-0000-4000-8000-000000000001');

do $$
declare
  v_claims jsonb;
  v_reservation_id uuid;
  v_result jsonb;
  v_retained bigint;
  v_path text := 'pro-credentials/96000000-0000-4000-8000-000000000001/'
    || '96000000-0000-4000-8000-000000000010/'
    || '96000000-0000-4000-8000-000000000011';
begin
  insert into public.pro_credential_evidence_upload_reservations (
    id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
    payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, status, lease_expires_at
  ) values (
    '96000000-0000-4000-8000-000000000012',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000010',
    '96000000-0000-4000-8000-000000000001', 0,
    '96000000-0000-4000-8000-000000000011', repeat('1', 64),
    '96000000-0000-4000-8000-000000000011', v_path,
    'application/pdf', 8, repeat('a', 64), 'expired.pdf', 'clamav', now(),
    'prepared', now() - interval '1 minute'
  );
  v_claims := public.claim_pro_credential_evidence_upload_cleanup(
    '96000000-0000-4000-8000-000000000020', 25
  );
  if pg_catalog.jsonb_array_length(v_claims) <> 1 then
    raise exception 'EXPIRED_UPLOAD_NOT_CLAIMED';
  end if;
  v_reservation_id := (v_claims -> 0 ->> 'reservationId')::uuid;
  v_result := public.finalize_pro_credential_evidence_upload_cleanup(
    v_reservation_id, '96000000-0000-4000-8000-000000000020'
  );
  if v_result ->> 'status' <> 'cleaned' or exists (
    select 1 from public.pro_credential_evidence_upload_reservations where id = v_reservation_id
  ) then raise exception 'CLEANUP_FINALIZE_DID_NOT_DELETE'; end if;

  insert into public.pro_credential_evidence_upload_reservations (
    id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
    payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, status, cleanup_after
  ) values (
    '96000000-0000-4000-8000-000000000026',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000010',
    '96000000-0000-4000-8000-000000000001', 0,
    '96000000-0000-4000-8000-000000000025', repeat('4', 64),
    '96000000-0000-4000-8000-000000000025',
    'pro-credentials/96000000-0000-4000-8000-000000000001/'
      || '96000000-0000-4000-8000-000000000010/'
      || '96000000-0000-4000-8000-000000000025',
    'application/pdf', 8, repeat('d', 64), 'grace.pdf', 'clamav', now(),
    'cleanup', now() + interval '7 days'
  );
  if pg_catalog.jsonb_array_length(public.claim_pro_credential_evidence_upload_cleanup(
    '96000000-0000-4000-8000-000000000027', 25
  )) <> 0 then raise exception 'CLEANUP_GRACE_PERIOD_IGNORED'; end if;

  insert into public.pro_credential_evidence_upload_reservations (
    id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
    payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, status, cleanup_after
  ) values (
    '96000000-0000-4000-8000-000000000022',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000010',
    '96000000-0000-4000-8000-000000000001', 0,
    '96000000-0000-4000-8000-000000000021', repeat('2', 64),
    '96000000-0000-4000-8000-000000000021',
    'pro-credentials/96000000-0000-4000-8000-000000000001/'
      || '96000000-0000-4000-8000-000000000010/'
      || '96000000-0000-4000-8000-000000000021',
    'application/pdf', 8, repeat('b', 64), 'race.pdf', 'clamav', now(),
    'cleanup', now() - interval '1 minute'
  );
  v_claims := public.claim_pro_credential_evidence_upload_cleanup(
    '96000000-0000-4000-8000-000000000023', 25
  );
  if pg_catalog.jsonb_array_length(v_claims) <> 1 then
    raise exception 'REFERENCE_RACE_CLAIM_FAILED';
  end if;
  insert into public.pro_credential_evidence (
    id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, uploaded_by
  ) values (
    '96000000-0000-4000-8000-000000000021',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000010',
    'pro-credentials/96000000-0000-4000-8000-000000000001/'
      || '96000000-0000-4000-8000-000000000010/'
      || '96000000-0000-4000-8000-000000000021',
    'application/pdf', 8, repeat('b', 64), 'race.pdf', 'clamav', now(),
    '96000000-0000-4000-8000-000000000001'
  );
  v_result := public.finalize_pro_credential_evidence_upload_cleanup(
    '96000000-0000-4000-8000-000000000022',
    '96000000-0000-4000-8000-000000000023'
  );
  if v_result ->> 'status' <> 'referenced' or not exists (
    select 1 from public.pro_credential_evidence_upload_reservations
    where id = '96000000-0000-4000-8000-000000000022' and status = 'finalized'
  ) then raise exception 'REFERENCE_RACE_DELETED_RESERVATION'; end if;

  if pg_catalog.jsonb_array_length(public.claim_pro_credential_evidence_upload_cleanup(
    '96000000-0000-4000-8000-000000000024', 25
  )) <> 0 then raise exception 'REFERENCED_CLEANUP_WAS_CLAIMED'; end if;

  insert into public.pro_credential_evidence_upload_reservations (
    id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
    payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, status, finalized_at
  ) values (
    '96000000-0000-4000-8000-000000000032',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000010',
    '96000000-0000-4000-8000-000000000001', 0,
    '96000000-0000-4000-8000-000000000031', repeat('3', 64),
    '96000000-0000-4000-8000-000000000031',
    'pro-credentials/96000000-0000-4000-8000-000000000001/'
      || '96000000-0000-4000-8000-000000000010/'
      || '96000000-0000-4000-8000-000000000031',
    'application/pdf', 8, repeat('c', 64), 'old.pdf', 'clamav', now(),
    'finalized', now() - interval '31 days'
  );
  v_retained := public.cleanup_finalized_pro_credential_evidence_upload_reservations();
  if v_retained < 1 or exists (
       select 1 from public.pro_credential_evidence_upload_reservations
       where id = '96000000-0000-4000-8000-000000000032'
     ) then raise exception 'FINALIZED_RETENTION_INVALID'; end if;
end;
$$;

rollback;
