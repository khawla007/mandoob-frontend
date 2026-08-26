\set ON_ERROR_STOP on
set statement_timeout = '20s';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('95100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upload-cleanup-race@example.invalid', 'synthetic', now(), '{}', '{}', now(), now());
insert into public.profiles (id, role, status, full_name) values
  ('95100000-0000-4000-8000-000000000001', 'pro', 'active', 'Upload Cleanup Race PRO');
insert into public.pro_profiles (profile_id) values ('95100000-0000-4000-8000-000000000001');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values
  ('95100000-0000-4000-8000-000000000010', '95100000-0000-4000-8000-000000000001', 'draft', 0, '95100000-0000-4000-8000-000000000001');
insert into public.pro_credential_evidence_upload_reservations (
  id, pro_profile_id, credential_id, actor_id, expected_version, operation_id,
  payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, status, lease_expires_at
) values (
  '95100000-0000-4000-8000-000000000012', '95100000-0000-4000-8000-000000000001',
  '95100000-0000-4000-8000-000000000010', '95100000-0000-4000-8000-000000000001',
  0, '95100000-0000-4000-8000-000000000011', repeat('1', 64),
  '95100000-0000-4000-8000-000000000011',
  'pro-credentials/95100000-0000-4000-8000-000000000001/95100000-0000-4000-8000-000000000010/95100000-0000-4000-8000-000000000011',
  'application/pdf', 8, repeat('a', 64), 'race.pdf', 'clamav',
  '2026-08-26T10:00:00Z', 'prepared', now() - interval '1 minute'
);
