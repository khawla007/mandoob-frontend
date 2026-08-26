\set ON_ERROR_STOP on
set statement_timeout = '20s';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '95200000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'evidence-mutex@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()
), (
  '95200000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'evidence-mutex-two@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name) values
  ('95200000-0000-4000-8000-000000000001', 'pro', 'active', 'Evidence Mutex PRO'),
  ('95200000-0000-4000-8000-000000000002', 'pro', 'active', 'Evidence Mutex PRO Two');
insert into public.pro_profiles (profile_id) values
  ('95200000-0000-4000-8000-000000000001'),
  ('95200000-0000-4000-8000-000000000002');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by) values
  ('95200000-0000-4000-8000-000000000010', '95200000-0000-4000-8000-000000000001', 'draft', 0, '95200000-0000-4000-8000-000000000001'),
  ('95200000-0000-4000-8000-000000000020', '95200000-0000-4000-8000-000000000002', 'draft', 0, '95200000-0000-4000-8000-000000000002');
insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values
  ('95200000-0000-4000-8000-000000000011', '95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000010', 'pro-credentials/95200000-0000-4000-8000-000000000001/95200000-0000-4000-8000-000000000010/95200000-0000-4000-8000-000000000011', 'application/pdf', 8, repeat('a', 64), 'upload-first.pdf', 'clamav', now(), '95200000-0000-4000-8000-000000000001'),
  ('95200000-0000-4000-8000-000000000021', '95200000-0000-4000-8000-000000000002', '95200000-0000-4000-8000-000000000020', 'pro-credentials/95200000-0000-4000-8000-000000000002/95200000-0000-4000-8000-000000000020/95200000-0000-4000-8000-000000000021', 'application/pdf', 8, repeat('b', 64), 'removal-first.pdf', 'clamav', now(), '95200000-0000-4000-8000-000000000002');
