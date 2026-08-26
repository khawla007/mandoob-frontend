\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

do $$
begin
  if has_table_privilege(
       'service_role', 'public.pro_credential_evidence_upload_reservations', 'SELECT'
     )
     or has_function_privilege(
       'authenticated',
       'public.prepare_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.prepare_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'UPLOAD_RESERVATION_PRIVILEGES_INVALID';
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '97000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'upload-reservation@example.invalid', 'synthetic', now(),
  '{}', '{}', now(), now()
), (
  '97000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'upload-resume@example.invalid', 'synthetic', now(),
  '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name) values
  ('97000000-0000-4000-8000-000000000001', 'pro', 'active', 'Upload Reservation PRO'),
  ('97000000-0000-4000-8000-000000000002', 'pro', 'active', 'Upload Resume PRO');
insert into public.pro_profiles (profile_id)
values ('97000000-0000-4000-8000-000000000001'),
       ('97000000-0000-4000-8000-000000000002');

select public.create_pro_credential_draft(
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000010', repeat('0', 64)
);
select public.create_pro_credential_draft(
  '97000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000020', repeat('0', 64)
);

do $$
declare
  v_credential_id uuid;
  v_first_operation constant uuid := '97000000-0000-4000-8000-000000000011';
  v_second_operation constant uuid := '97000000-0000-4000-8000-000000000012';
  v_first_path text;
  v_second_path text;
  v_prepared jsonb;
  v_replay jsonb;
  v_cleanup jsonb;
begin
  select id into strict v_credential_id
  from public.pro_credentials
  where pro_profile_id = '97000000-0000-4000-8000-000000000001';
  v_first_path := 'pro-credentials/97000000-0000-4000-8000-000000000001/'
    || v_credential_id::text || '/' || v_first_operation::text;
  v_second_path := 'pro-credentials/97000000-0000-4000-8000-000000000001/'
    || v_credential_id::text || '/' || v_second_operation::text;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '97000000-0000-4000-8000-000000000001', v_credential_id, 1,
      '97000000-0000-4000-8000-000000000019', repeat('9', 64),
      '97000000-0000-4000-8000-000000000019',
      'pro-credentials/97000000-0000-4000-8000-000000000001/' || v_credential_id::text
        || '/97000000-0000-4000-8000-000000000019',
      'application/pdf', 8, repeat('9', 64), 'stale.pdf', 'clamav', now()
    );
    raise exception 'STALE_PREFLIGHT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'STALE_CREDENTIAL_VERSION' then raise; end if;
  end;

  v_prepared := public.prepare_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
    v_first_operation, repeat('1', 64), v_first_operation, v_first_path,
    'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'clamav',
    '2026-08-26T10:00:00Z'
  );
  if v_prepared ->> 'status' <> 'prepared' then
    raise exception 'SAME_OPERATION_DID_NOT_RESUME';
  end if;

  begin
    update public.pro_credentials set version = version + 1 where id = v_credential_id;
    raise exception 'CONCURRENT_CREDENTIAL_MUTATION_NOT_FENCED';
  exception when others then
    if sqlerrm <> 'EVIDENCE_UPLOAD_IN_PROGRESS' then raise; end if;
  end;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
      v_first_operation, repeat('2', 64), v_first_operation, v_first_path,
      'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'clamav',
      '2026-08-26T10:00:00Z'
    );
    raise exception 'PAYLOAD_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;

  v_prepared := public.prepare_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
    v_first_operation, repeat('1', 64), v_first_operation, v_first_path,
    'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'clamav',
    '2026-08-26T10:00:00Z'
  );
  if v_prepared ->> 'status' <> 'prepared'
     or (select count(*) from public.pro_credential_evidence_upload_reservations
         where credential_id = v_credential_id and status = 'prepared') <> 1 then
    raise exception 'SAME_OPERATION_DID_NOT_RESUME';
  end if;

  begin
    perform public.prepare_pro_credential_evidence_upload(
      '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
      v_second_operation, repeat('2', 64), v_second_operation, v_second_path,
      'application/pdf', 9, repeat('b', 64), 'new-proof.pdf', 'clamav',
      '2026-08-26T10:01:00Z'
    );
    raise exception 'DIFFERENT_OPERATION_NOT_FENCED';
  exception when others then
    if sqlerrm <> 'EVIDENCE_UPLOAD_IN_PROGRESS' then raise; end if;
  end;

  update public.pro_credential_evidence_upload_reservations
  set lease_expires_at = now() - interval '1 minute'
  where credential_id = v_credential_id and operation_id = v_first_operation;
  v_prepared := public.prepare_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
    v_second_operation, repeat('2', 64), v_second_operation, v_second_path,
    'application/pdf', 9, repeat('b', 64), 'new-proof.pdf', 'clamav',
    '2026-08-26T10:01:00Z'
  );
  if v_prepared ->> 'status' <> 'prepared'
     or pg_catalog.jsonb_array_length(v_prepared -> 'cleanup') <> 1
     or not exists (
       select 1 from public.pro_credential_evidence_upload_reservations
       where credential_id = v_credential_id and operation_id = v_first_operation
         and status = 'cleanup'
     ) then
    raise exception 'EXPIRED_RESERVATION_NOT_RECOVERED';
  end if;

  begin
    perform public.finalize_pro_credential_evidence_upload(
      '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
      v_first_operation, repeat('1', 64), v_first_operation, v_first_path,
      'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'clamav',
      '2026-08-26T10:00:00Z'
    );
    raise exception 'EXPIRED_RESERVATION_NOT_FENCED';
  exception when others then
    if sqlerrm <> 'EVIDENCE_UPLOAD_RESERVATION_LOST' then raise; end if;
  end;

  v_replay := public.finalize_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
    v_second_operation, repeat('2', 64), v_second_operation, v_second_path,
    'application/pdf', 9, repeat('b', 64), 'new-proof.pdf', 'clamav',
    '2026-08-26T10:01:00Z'
  );
  if v_replay ->> 'version' <> '1'
     or not exists (select 1 from public.pro_credential_evidence where id = v_second_operation)
     or not exists (
       select 1 from public.pro_lifecycle_operation_receipts
       where entity_id = v_credential_id and operation_id = v_second_operation
     )
     or not exists (
       select 1 from public.auth_events
       where kind = 'pro_lifecycle_changed'
         and details ->> 'action' = 'credential_evidence_added'
         and details ->> 'entityId' = v_credential_id::text
     )
     or not exists (
       select 1 from public.pro_credential_evidence_upload_reservations
       where credential_id = v_credential_id and operation_id = v_second_operation
         and status = 'finalized'
     ) then
    raise exception 'FINALIZATION_NOT_ATOMIC';
  end if;

  if public.finalize_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000001', v_credential_id, 0,
    v_second_operation, repeat('2', 64), v_second_operation, v_second_path,
    'application/pdf', 9, repeat('b', 64), 'new-proof.pdf', 'clamav',
    '2026-08-26T10:01:00Z'
  ) is distinct from v_replay then
    raise exception 'FINALIZATION_REPLAY_CHANGED';
  end if;

  insert into public.pro_credential_evidence (
    id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, uploaded_by
  ) values (
    v_first_operation, '97000000-0000-4000-8000-000000000001', v_credential_id,
    v_first_path, 'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'clamav',
    '2026-08-26T10:00:00Z', '97000000-0000-4000-8000-000000000001'
  );
  alter table public.pro_credential_evidence_upload_reservations
    disable trigger guard_pro_credential_evidence_upload_reservation;
  update public.pro_credential_evidence_upload_reservations
  set cleanup_after = now() - interval '1 minute'
  where credential_id = v_credential_id and operation_id = v_first_operation;
  alter table public.pro_credential_evidence_upload_reservations
    enable trigger guard_pro_credential_evidence_upload_reservation;
  v_cleanup := public.claim_pro_credential_evidence_upload_cleanup(
    '97000000-0000-4000-8000-000000000018', 25
  );
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_cleanup) claim
    where claim ->> 'reservationId' = (
      select id::text from public.pro_credential_evidence_upload_reservations
      where credential_id = v_credential_id and operation_id = v_first_operation
    )
  ) or not exists (
    select 1 from public.pro_credential_evidence_upload_reservations
    where credential_id = v_credential_id and operation_id = v_first_operation
  ) then
    raise exception 'CLEANUP_REFERENCED_OBJECT';
  end if;
end;
$$;

do $$
declare
  v_credential_id uuid;
  v_operation constant uuid := '97000000-0000-4000-8000-000000000021';
  v_path text;
begin
  select id into strict v_credential_id
  from public.pro_credentials
  where pro_profile_id = '97000000-0000-4000-8000-000000000002';
  v_path := 'pro-credentials/97000000-0000-4000-8000-000000000002/'
    || v_credential_id::text || '/' || v_operation::text;
  perform public.prepare_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000002', v_credential_id, 0,
    v_operation, repeat('3', 64), v_operation, v_path,
    'application/pdf', 10, repeat('c', 64), 'resume.pdf', 'clamav',
    '2026-08-26T10:00:00Z'
  );
  update public.pro_credential_evidence_upload_reservations
  set lease_expires_at = now() - interval '1 minute'
  where credential_id = v_credential_id and operation_id = v_operation;
  perform public.prepare_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000002', v_credential_id, 0,
    v_operation, repeat('3', 64), v_operation, v_path,
    'application/pdf', 10, repeat('c', 64), 'resume.pdf', 'clamav',
    '2026-08-26T10:05:00Z'
  );
  perform public.finalize_pro_credential_evidence_upload(
    '97000000-0000-4000-8000-000000000002', v_credential_id, 0,
    v_operation, repeat('3', 64), v_operation, v_path,
    'application/pdf', 10, repeat('c', 64), 'resume.pdf', 'clamav',
    '2026-08-26T10:05:00Z'
  );
  if not exists (
    select 1 from public.pro_credential_evidence
    where id = v_operation and scan_completed_at = '2026-08-26T10:00:00Z'
  ) then
    raise exception 'EXPIRED_SAME_OPERATION_RESUME_LOST_EXACT_METADATA';
  end if;
end;
$$;

rollback;
