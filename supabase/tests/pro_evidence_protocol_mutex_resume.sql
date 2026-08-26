\set ON_ERROR_STOP on
set statement_timeout = '20s';

insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, lease_expires_at
) values (
  '95200000-0000-4000-8000-000000000014',
  '95200000-0000-4000-8000-000000000001',
  '95200000-0000-4000-8000-000000000010',
  '95200000-0000-4000-8000-000000000011',
  '95200000-0000-4000-8000-000000000001', 0,
  '95200000-0000-4000-8000-000000000013', repeat('2', 64),
  'pro-credentials/95200000-0000-4000-8000-000000000001/95200000-0000-4000-8000-000000000010/95200000-0000-4000-8000-000000000011',
  'prepared', now() + interval '15 minutes'
);
do $$ begin
  perform public.prepare_pro_credential_evidence_upload(
    '95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000010', 0,
    '95200000-0000-4000-8000-000000000012', repeat('1', 64),
    '95200000-0000-4000-8000-000000000012',
    'pro-credentials/95200000-0000-4000-8000-000000000001/95200000-0000-4000-8000-000000000010/95200000-0000-4000-8000-000000000012',
    'application/pdf', 8, repeat('c', 64), 'new.pdf', 'clamav', now()
  );
  raise exception 'UPLOAD_RESUME_IGNORED_ACTIVE_REMOVAL';
exception when others then
  if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
end $$;

insert into public.pro_credential_evidence_upload_reservations (
  id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
  payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, status, lease_expires_at
) values (
  '95200000-0000-4000-8000-000000000024',
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000020',
  '95200000-0000-4000-8000-000000000002', 0,
  '95200000-0000-4000-8000-000000000023', repeat('4', 64),
  '95200000-0000-4000-8000-000000000023',
  'pro-credentials/95200000-0000-4000-8000-000000000002/95200000-0000-4000-8000-000000000020/95200000-0000-4000-8000-000000000023',
  'application/pdf', 8, repeat('d', 64), 'blocked.pdf', 'clamav', now(),
  'prepared', now() + interval '15 minutes'
);
do $$ begin
  perform public.prepare_pro_credential_evidence_removal(
    '95200000-0000-4000-8000-000000000002', '95200000-0000-4000-8000-000000000020',
    '95200000-0000-4000-8000-000000000021', 0,
    '95200000-0000-4000-8000-000000000022', repeat('3', 64)
  );
  raise exception 'REMOVAL_RESUME_IGNORED_ACTIVE_UPLOAD';
exception when others then
  if sqlerrm <> 'EVIDENCE_UPLOAD_IN_PROGRESS' then raise; end if;
end $$;

do $$ begin
  if (select count(*) from public.pro_credential_evidence_upload_reservations
      where credential_id in (
        '95200000-0000-4000-8000-000000000010',
        '95200000-0000-4000-8000-000000000020'
      ) and status = 'prepared' and lease_expires_at > now()) <> 2
     or (select count(*) from public.pro_credential_evidence_removals
      where credential_id in (
        '95200000-0000-4000-8000-000000000010',
        '95200000-0000-4000-8000-000000000020'
      ) and status = 'prepared' and lease_expires_at > now()) <> 2 then
    raise exception 'MUTEX_RESUME_LEASE_STATE_INVALID';
  end if;
end $$;
