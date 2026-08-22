\set ON_ERROR_STOP on
set statement_timeout = '20s';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('95000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recovery-race-operator@example.invalid', 'synthetic', now(), '{}', '{}', now(), now()),
  ('95000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recovery-race-pro@example.invalid', 'synthetic', now(), '{}', '{}', now(), now());
insert into public.profiles (id, role, status, full_name) values
  ('95000000-0000-4000-8000-000000000001', 'admin', 'active', 'Recovery Race Operator'),
  ('95000000-0000-4000-8000-000000000002', 'pro', 'active', 'Recovery Race PRO');
insert into public.pro_profiles (profile_id) values ('95000000-0000-4000-8000-000000000002');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by)
values ('95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000002', 'draft', 0, '95000000-0000-4000-8000-000000000002');
insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values (
  '95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010',
  'pro-credentials/95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000010/95000000-0000-4000-8000-000000000011',
  'application/pdf', 8, repeat('9', 64), 'race.pdf', 'fixture', now(), '95000000-0000-4000-8000-000000000002'
);
insert into public.pro_credential_evidence_removals (
  id, pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
  operation_id, payload_hash, storage_path, status, lease_expires_at, created_at
) values (
  '95000000-0000-4000-8000-000000000012', '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000002', 0,
  '95000000-0000-4000-8000-000000000013', repeat('8', 64), 'pro-credentials/95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000010/95000000-0000-4000-8000-000000000011', 'prepared', now() - interval '1 minute', now() - interval '20 minutes'
);
