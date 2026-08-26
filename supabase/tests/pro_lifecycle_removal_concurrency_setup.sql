\set ON_ERROR_STOP on
set statement_timeout = '15s';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '92000000-0000-4000-8000-000000000040', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'removal-race@example.invalid', 'synthetic', now(),
  '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name)
values ('92000000-0000-4000-8000-000000000040', 'pro', 'active', 'Removal Race PRO');
insert into public.pro_profiles (profile_id)
values ('92000000-0000-4000-8000-000000000040');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by)
values (
  '92000000-0000-4000-8000-000000000030',
  '92000000-0000-4000-8000-000000000040', 'draft', 0,
  '92000000-0000-4000-8000-000000000040'
);
insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values (
  '92000000-0000-4000-8000-000000000031',
  '92000000-0000-4000-8000-000000000040',
  '92000000-0000-4000-8000-000000000030',
  'pro-credentials/92000000-0000-4000-8000-000000000040/92000000-0000-4000-8000-000000000030/92000000-0000-4000-8000-000000000031',
  'application/pdf', 8, repeat('e', 64), 'race.pdf', 'fixture', now(),
  '92000000-0000-4000-8000-000000000040'
);
