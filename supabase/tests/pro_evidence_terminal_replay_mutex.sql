\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('95300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'terminal-upload@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('95300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'terminal-removal@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('95300000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'terminal-outsider@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('95300000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'terminal-admin@example.invalid', 'synthetic', now(), '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('95300000-0000-4000-8000-000000000001', 'pro', 'active', 'Terminal Upload PRO'),
  ('95300000-0000-4000-8000-000000000002', 'pro', 'active', 'Terminal Removal PRO'),
  ('95300000-0000-4000-8000-000000000003', 'pro', 'active', 'Terminal Outsider PRO'),
  ('95300000-0000-4000-8000-000000000004', 'admin', 'active', 'Terminal Admin');
insert into public.pro_profiles (profile_id) values
  ('95300000-0000-4000-8000-000000000001'),
  ('95300000-0000-4000-8000-000000000002'),
  ('95300000-0000-4000-8000-000000000003');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values
  ('95300000-0000-4000-8000-000000000010', '95300000-0000-4000-8000-000000000001', 'draft', 0, '95300000-0000-4000-8000-000000000001'),
  ('95300000-0000-4000-8000-000000000020', '95300000-0000-4000-8000-000000000002', 'draft', 0, '95300000-0000-4000-8000-000000000002');

do $$
declare
  v_result jsonb;
  v_upload_operation constant uuid := '95300000-0000-4000-8000-000000000011';
  v_upload_path constant text := 'pro-credentials/95300000-0000-4000-8000-000000000001/95300000-0000-4000-8000-000000000010/95300000-0000-4000-8000-000000000011';
  v_removal_operation constant uuid := '95300000-0000-4000-8000-000000000012';
begin
  perform public.prepare_pro_credential_evidence_upload(
    '95300000-0000-4000-8000-000000000001', '95300000-0000-4000-8000-000000000010', 0,
    v_upload_operation, repeat('1', 64), v_upload_operation, v_upload_path,
    'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'clamav',
    '2026-08-26T12:00:00Z'
  );
  perform public.finalize_pro_credential_evidence_upload(
    '95300000-0000-4000-8000-000000000001', '95300000-0000-4000-8000-000000000010', 0,
    v_upload_operation, repeat('1', 64), v_upload_operation, v_upload_path,
    'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'clamav',
    '2026-08-26T12:00:00Z'
  );
  perform public.prepare_pro_credential_evidence_removal(
    '95300000-0000-4000-8000-000000000001', '95300000-0000-4000-8000-000000000010',
    v_upload_operation, 1, v_removal_operation, repeat('2', 64)
  );

  v_result := public.prepare_pro_credential_evidence_upload(
    '95300000-0000-4000-8000-000000000001', '95300000-0000-4000-8000-000000000010', 0,
    v_upload_operation, repeat('1', 64), v_upload_operation, v_upload_path,
    'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'private-clamav-secondary',
    '2026-08-26T12:05:00Z'
  );
  if v_result ->> 'status' <> 'complete' then
    raise exception 'UPLOAD_TERMINAL_REPLAY_BLOCKED_BY_REMOVAL';
  end if;
  if v_result #>> '{credential,version}' <> '1' then
    raise exception 'UPLOAD_TERMINAL_REPLAY_SCANNER_METADATA_CHANGED';
  end if;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '95300000-0000-4000-8000-000000000001', '95300000-0000-4000-8000-000000000010', 0,
      v_upload_operation, repeat('9', 64), v_upload_operation, v_upload_path,
      'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'clamav',
      '2026-08-26T12:00:00Z'
    );
    raise exception 'UPLOAD_TERMINAL_REPLAY_PAYLOAD_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '95300000-0000-4000-8000-000000000004', '95300000-0000-4000-8000-000000000010', 0,
      v_upload_operation, repeat('1', 64), v_upload_operation, v_upload_path,
      'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'clamav',
      '2026-08-26T12:00:00Z'
    );
    raise exception 'UPLOAD_TERMINAL_REPLAY_ACTOR_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '95300000-0000-4000-8000-000000000003', '95300000-0000-4000-8000-000000000010', 0,
      v_upload_operation, repeat('1', 64), v_upload_operation, v_upload_path,
      'application/pdf', 8, repeat('a', 64), 'terminal-upload.pdf', 'clamav',
      '2026-08-26T12:00:00Z'
    );
    raise exception 'UPLOAD_TERMINAL_REPLAY_UNAUTHORIZED';
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
end;
$$;

insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values (
  '95300000-0000-4000-8000-000000000021', '95300000-0000-4000-8000-000000000002',
  '95300000-0000-4000-8000-000000000020',
  'pro-credentials/95300000-0000-4000-8000-000000000002/95300000-0000-4000-8000-000000000020/95300000-0000-4000-8000-000000000021',
  'application/pdf', 8, repeat('b', 64), 'terminal-removal.pdf', 'clamav',
  '2026-08-26T12:01:00Z', '95300000-0000-4000-8000-000000000002'
);

do $$
declare
  v_result jsonb;
  v_evidence constant uuid := '95300000-0000-4000-8000-000000000021';
  v_removal_operation constant uuid := '95300000-0000-4000-8000-000000000022';
  v_upload_operation constant uuid := '95300000-0000-4000-8000-000000000023';
  v_upload_path constant text := 'pro-credentials/95300000-0000-4000-8000-000000000002/95300000-0000-4000-8000-000000000020/95300000-0000-4000-8000-000000000023';
begin
  perform public.prepare_pro_credential_evidence_removal(
    '95300000-0000-4000-8000-000000000002', '95300000-0000-4000-8000-000000000020',
    v_evidence, 0, v_removal_operation, repeat('3', 64)
  );
  perform public.finalize_pro_credential_evidence_removal(
    '95300000-0000-4000-8000-000000000002', '95300000-0000-4000-8000-000000000020',
    v_evidence, 0, v_removal_operation, repeat('3', 64)
  );
  perform public.prepare_pro_credential_evidence_upload(
    '95300000-0000-4000-8000-000000000002', '95300000-0000-4000-8000-000000000020', 1,
    v_upload_operation, repeat('4', 64), v_upload_operation, v_upload_path,
    'application/pdf', 9, repeat('c', 64), 'after-removal.pdf', 'clamav',
    '2026-08-26T12:02:00Z'
  );

  v_result := public.prepare_pro_credential_evidence_removal(
    '95300000-0000-4000-8000-000000000002', '95300000-0000-4000-8000-000000000020',
    v_evidence, 0, v_removal_operation, repeat('3', 64)
  );
  if v_result ->> 'status' <> 'complete' or v_result #>> '{credential,version}' <> '1' then
    raise exception 'REMOVAL_TERMINAL_REPLAY_BLOCKED_BY_UPLOAD';
  end if;

  begin
    perform public.prepare_pro_credential_evidence_removal(
      '95300000-0000-4000-8000-000000000002', '95300000-0000-4000-8000-000000000020',
      v_evidence, 0, v_removal_operation, repeat('9', 64)
    );
    raise exception 'REMOVAL_TERMINAL_REPLAY_PAYLOAD_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  begin
    perform public.prepare_pro_credential_evidence_removal(
      '95300000-0000-4000-8000-000000000004', '95300000-0000-4000-8000-000000000020',
      v_evidence, 0, v_removal_operation, repeat('3', 64)
    );
    raise exception 'REMOVAL_TERMINAL_REPLAY_ACTOR_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  begin
    perform public.prepare_pro_credential_evidence_removal(
      '95300000-0000-4000-8000-000000000003', '95300000-0000-4000-8000-000000000020',
      v_evidence, 0, v_removal_operation, repeat('3', 64)
    );
    raise exception 'REMOVAL_TERMINAL_REPLAY_UNAUTHORIZED';
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
end;
$$;

rollback;
