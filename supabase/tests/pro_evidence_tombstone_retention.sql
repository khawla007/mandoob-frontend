\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '95400000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'evidence-retention@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name) values (
  '95400000-0000-4000-8000-000000000001', 'pro', 'active', 'Evidence Retention PRO'
);
insert into public.pro_profiles (profile_id) values (
  '95400000-0000-4000-8000-000000000001'
);
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values (
  '95400000-0000-4000-8000-000000000010',
  '95400000-0000-4000-8000-000000000001', 'draft', 0,
  '95400000-0000-4000-8000-000000000001'
);

insert into public.pro_credential_evidence_upload_reservations (
  id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
  payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, status, cleanup_passes,
  finalized_at, created_at
) values
  (
    '95400000-0000-4000-8000-000000000011',
    '95400000-0000-4000-8000-000000000001',
    '95400000-0000-4000-8000-000000000010',
    '95400000-0000-4000-8000-000000000001', 0,
    '95400000-0000-4000-8000-000000000012', repeat('1', 64),
    '95400000-0000-4000-8000-000000000012',
    'pro-credentials/95400000-0000-4000-8000-000000000001/95400000-0000-4000-8000-000000000010/95400000-0000-4000-8000-000000000012',
    'application/pdf', 8, repeat('a', 64), 'finalized.pdf', 'clamav', now(),
    'finalized', 0, now() - interval '90 days 12 hours',
    now() - interval '90 days 12 hours'
  ),
  (
    '95400000-0000-4000-8000-000000000013',
    '95400000-0000-4000-8000-000000000001',
    '95400000-0000-4000-8000-000000000010',
    '95400000-0000-4000-8000-000000000001', 0,
    '95400000-0000-4000-8000-000000000014', repeat('2', 64),
    '95400000-0000-4000-8000-000000000014',
    'pro-credentials/95400000-0000-4000-8000-000000000001/95400000-0000-4000-8000-000000000010/95400000-0000-4000-8000-000000000014',
    'application/pdf', 8, repeat('b', 64), 'cleaned.pdf', 'clamav', now(),
    'cleaned', 2, now() - interval '90 days 12 hours',
    now() - interval '90 days 12 hours'
  );

insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, sanitized_result,
  completed_at, cancelled_at, recovery_actor_id, created_at
) values
  (
    '95400000-0000-4000-8000-000000000021',
    '95400000-0000-4000-8000-000000000001',
    '95400000-0000-4000-8000-000000000010',
    '95400000-0000-4000-8000-000000000022',
    '95400000-0000-4000-8000-000000000001', 0,
    '95400000-0000-4000-8000-000000000023', repeat('3', 64), null,
    'complete', '{"credentialId":"95400000-0000-4000-8000-000000000010","version":1}',
    now() - interval '90 days 12 hours', null, null,
    now() - interval '90 days 12 hours'
  ),
  (
    '95400000-0000-4000-8000-000000000024',
    '95400000-0000-4000-8000-000000000001',
    '95400000-0000-4000-8000-000000000010',
    '95400000-0000-4000-8000-000000000025',
    '95400000-0000-4000-8000-000000000001', 0,
    '95400000-0000-4000-8000-000000000026', repeat('4', 64), null,
    'cancelled', null, null, now() - interval '90 days 12 hours',
    '95400000-0000-4000-8000-000000000001',
    now() - interval '90 days 12 hours'
  );

insert into public.pro_lifecycle_operation_receipts (
  entity_kind, entity_id, operation_id, payload_hash, sanitized_result, created_at
) values
  ('credential', '95400000-0000-4000-8000-000000000010',
   '95400000-0000-4000-8000-000000000012', repeat('1', 64), '{}',
   now() - interval '90 days 12 hours'),
  ('credential', '95400000-0000-4000-8000-000000000010',
   '95400000-0000-4000-8000-000000000023', repeat('3', 64), '{}',
   now() - interval '90 days 12 hours');

select public.cleanup_pro_lifecycle_operation_receipts();

do $$ begin
  if public.cleanup_finalized_pro_credential_evidence_upload_reservations() <> 0
     or (select count(*) from public.pro_credential_evidence_upload_reservations
         where credential_id = '95400000-0000-4000-8000-000000000010'
           and status in ('finalized', 'cleaned')) <> 2 then
    raise exception 'UPLOAD_TOMBSTONE_REMOVED_INSIDE_RECEIPT_WINDOW';
  end if;
  if public.cleanup_pro_credential_evidence_removals() <> 0
     or (select count(*) from public.pro_credential_evidence_removals
         where credential_id = '95400000-0000-4000-8000-000000000010'
           and status in ('complete', 'cancelled')) <> 2 then
    raise exception 'REMOVAL_TOMBSTONE_REMOVED_INSIDE_RECEIPT_WINDOW';
  end if;
  if exists (
    select 1 from public.pro_lifecycle_operation_receipts
    where entity_id = '95400000-0000-4000-8000-000000000010'
  ) then
    raise exception 'RECEIPT_NOT_REMOVED_AT_NINETY_DAYS';
  end if;
end $$;

alter table public.pro_credential_evidence_upload_reservations
  disable trigger guard_pro_credential_evidence_upload_reservation;
update public.pro_credential_evidence_upload_reservations
set finalized_at = now() - interval '92 days'
where credential_id = '95400000-0000-4000-8000-000000000010';
alter table public.pro_credential_evidence_upload_reservations
  enable trigger guard_pro_credential_evidence_upload_reservation;

alter table public.pro_credential_evidence_removals
  disable trigger pro_credential_evidence_removals_immutable;
update public.pro_credential_evidence_removals
set completed_at = case when status = 'complete' then now() - interval '92 days' end,
    cancelled_at = case when status = 'cancelled' then now() - interval '92 days' end
where credential_id = '95400000-0000-4000-8000-000000000010';
alter table public.pro_credential_evidence_removals
  enable trigger pro_credential_evidence_removals_immutable;

do $$
declare
  v_upload_deleted bigint;
  v_removal_deleted integer;
begin
  v_upload_deleted := public.cleanup_finalized_pro_credential_evidence_upload_reservations();
  if v_upload_deleted < 2 or exists (
       select 1 from public.pro_credential_evidence_upload_reservations
       where credential_id = '95400000-0000-4000-8000-000000000010'
     ) then
    raise exception 'UPLOAD_TOMBSTONE_NOT_REMOVED_AFTER_RETENTION';
  end if;
  v_removal_deleted := public.cleanup_pro_credential_evidence_removals();
  if v_removal_deleted < 2 or exists (
       select 1 from public.pro_credential_evidence_removals
       where credential_id = '95400000-0000-4000-8000-000000000010'
     ) then
    raise exception 'REMOVAL_TOMBSTONE_NOT_REMOVED_AFTER_RETENTION';
  end if;
end $$;

rollback;
