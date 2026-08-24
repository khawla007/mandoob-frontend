\set ON_ERROR_STOP on
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from (values
  ('95000000-0000-4000-8000-000000000001'::uuid, 'concurrency-admin-a@example.test'),
  ('95000000-0000-4000-8000-000000000002'::uuid, 'concurrency-admin-b@example.test'),
  ('95000000-0000-4000-8000-000000000011'::uuid, 'concurrency-pro-1@example.test'),
  ('95000000-0000-4000-8000-000000000012'::uuid, 'concurrency-pro-2@example.test'),
  ('95000000-0000-4000-8000-000000000013'::uuid, 'concurrency-pro-3@example.test'),
  ('95000000-0000-4000-8000-000000000014'::uuid, 'concurrency-pro-4@example.test'),
  ('95000000-0000-4000-8000-000000000015'::uuid, 'concurrency-pro-5@example.test'),
  ('95000000-0000-4000-8000-000000000016'::uuid, 'concurrency-pro-6@example.test'),
  ('95000000-0000-4000-8000-000000000017'::uuid, 'concurrency-pro-7@example.test')
) users(id, email);
insert into public.profiles (id, role, status, full_name)
select id, role::public.user_role, 'active', name from (values
  ('95000000-0000-4000-8000-000000000001'::uuid, 'super_admin', 'Concurrency Admin A'),
  ('95000000-0000-4000-8000-000000000002'::uuid, 'admin', 'Concurrency Admin B'),
  ('95000000-0000-4000-8000-000000000011'::uuid, 'pro', 'Concurrency PRO 1'),
  ('95000000-0000-4000-8000-000000000012'::uuid, 'pro', 'Concurrency PRO 2'),
  ('95000000-0000-4000-8000-000000000013'::uuid, 'pro', 'Concurrency PRO 3'),
  ('95000000-0000-4000-8000-000000000014'::uuid, 'pro', 'Concurrency PRO 4'),
  ('95000000-0000-4000-8000-000000000015'::uuid, 'pro', 'Concurrency PRO 5'),
  ('95000000-0000-4000-8000-000000000016'::uuid, 'pro', 'Concurrency PRO 6'),
  ('95000000-0000-4000-8000-000000000017'::uuid, 'pro', 'Concurrency PRO 7')
) rows(id, role, name);
insert into public.pro_profiles (profile_id)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
from pg_catalog.generate_series(11, 17) value;
insert into public.pro_credentials (
  id, pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by
)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad((40 + value)::text, 12, '0'))::uuid,
  ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'synthetic', pg_catalog.md5(value::text) || pg_catalog.md5('x' || value::text),
  pg_catalog.lpad(value::text, 4, '0'), 'Synthetic Authority', current_date - 30,
  current_date + 365, 'verified', 1, pg_catalog.now(),
  '95000000-0000-4000-8000-000000000001'
from pg_catalog.generate_series(11, 17) value;
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from,
  status, version, created_by
)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad((100 + value * 2 + kind_no)::text, 12, '0'))::uuid,
  ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  kind::public.pro_term_kind, 'per_registration', 10000, current_date - 1,
  'active', 1, '95000000-0000-4000-8000-000000000001'
from pg_catalog.generate_series(11, 17) value
cross join (values (0, 'pricing'), (1, 'compensation')) kinds(kind_no, kind);
insert into public.tenants (id, name, slug, plan, status)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'Concurrency ' || value, 'concurrency-' || value, 'starter', 'active'
from pg_catalog.generate_series(21, 26) value;
insert into public.company_profiles (id, tenant_id, company_name, status)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad((value + 10)::text, 12, '0'))::uuid,
  ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'Concurrency Company ' || value, 'active'
from pg_catalog.generate_series(21, 26) value;

select (public.assign_pro_to_company(
  '95000000-0000-4000-8000-000000000034', '95000000-0000-4000-8000-000000000014',
  '95000000-0000-4000-8000-000000000001'
) ->> 'assignmentId') as release_assignment_id \gset
select (public.assign_pro_to_company(
  '95000000-0000-4000-8000-000000000035', '95000000-0000-4000-8000-000000000015',
  '95000000-0000-4000-8000-000000000001'
) ->> 'assignmentId') as swap_assignment_a_id \gset
select (public.assign_pro_to_company(
  '95000000-0000-4000-8000-000000000036', '95000000-0000-4000-8000-000000000016',
  '95000000-0000-4000-8000-000000000001'
) ->> 'assignmentId') as swap_assignment_b_id \gset

create table if not exists public.assignment_concurrency_fixture_ids (
  fixture text primary key, assignment_id uuid not null
);
truncate public.assignment_concurrency_fixture_ids;
insert into public.assignment_concurrency_fixture_ids values
  ('release-assign', :'release_assignment_id'),
  ('swap-a', :'swap_assignment_a_id'),
  ('swap-b', :'swap_assignment_b_id');
revoke all on public.assignment_concurrency_fixture_ids from public, anon, authenticated;
commit;
select 'assignment_concurrency_ready' as assignment_concurrency_ready;
