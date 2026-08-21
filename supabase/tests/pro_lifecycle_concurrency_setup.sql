\set ON_ERROR_STOP on
set statement_timeout = '15s';

delete from public.auth_events
where actor_user_id in (
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002'
);
delete from public.pro_lifecycle_operation_receipts
where entity_id in (
  '92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000003',
  '92000000-0000-4000-8000-000000000004'
);
delete from public.pro_credential_decisions
where pro_profile_id = '92000000-0000-4000-8000-000000000002';
delete from public.pro_commercial_term_events
where pro_profile_id = '92000000-0000-4000-8000-000000000002';
delete from public.pro_commercial_terms
where pro_profile_id = '92000000-0000-4000-8000-000000000002';
delete from public.pro_credentials
where pro_profile_id = '92000000-0000-4000-8000-000000000002';
delete from auth.users where id in (
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002'
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('92000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'race-admin@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'race-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());
insert into public.profiles (id, role, status, full_name) values
  ('92000000-0000-4000-8000-000000000001', 'admin', 'active', 'Race Operator'),
  ('92000000-0000-4000-8000-000000000002', 'pro', 'active', 'Race PRO');
insert into public.pro_profiles (profile_id)
values ('92000000-0000-4000-8000-000000000002');
insert into public.pro_credentials (
  id, pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by
) values (
  '92000000-0000-4000-8000-000000000003',
  '92000000-0000-4000-8000-000000000002', 'synthetic', repeat('c', 64), 'CD34',
  'Synthetic Authority', current_date, current_date + 365, 'under_review', 4, now(),
  '92000000-0000-4000-8000-000000000002'
);
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from,
  status, version, created_by
) values (
  '92000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000002', 'pricing', 'per_registration', 10000,
  current_date + 1, 'draft', 1, '92000000-0000-4000-8000-000000000001'
);
