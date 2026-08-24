\set ON_ERROR_STOP on
begin;

-- Reset only the deterministic Task 11 identities. Keep the assignment ledger
-- cleanup explicit so each run starts clean while history assertions remain
-- meaningful inside that run.
delete from public.pro_assignment_term_links links
using public.pro_company_assignments assignments
where links.assignment_id = assignments.id
  and (
    assignments.company_id in (
      '95000000-0000-4000-8000-000000000031',
      '95000000-0000-4000-8000-000000000032',
      '95000000-0000-4000-8000-000000000033',
      '95000000-0000-4000-8000-000000000034',
      '95000000-0000-4000-8000-000000000035',
      '95000000-0000-4000-8000-000000000036'
    )
    or assignments.pro_profile_id in (
      '95000000-0000-4000-8000-000000000011',
      '95000000-0000-4000-8000-000000000012',
      '95000000-0000-4000-8000-000000000013',
      '95000000-0000-4000-8000-000000000014',
      '95000000-0000-4000-8000-000000000015',
      '95000000-0000-4000-8000-000000000016',
      '95000000-0000-4000-8000-000000000017'
    )
  );
delete from public.pro_company_assignments
where company_id in (
  '95000000-0000-4000-8000-000000000031',
  '95000000-0000-4000-8000-000000000032',
  '95000000-0000-4000-8000-000000000033',
  '95000000-0000-4000-8000-000000000034',
  '95000000-0000-4000-8000-000000000035',
  '95000000-0000-4000-8000-000000000036'
)
or pro_profile_id in (
  '95000000-0000-4000-8000-000000000011',
  '95000000-0000-4000-8000-000000000012',
  '95000000-0000-4000-8000-000000000013',
  '95000000-0000-4000-8000-000000000014',
  '95000000-0000-4000-8000-000000000015',
  '95000000-0000-4000-8000-000000000016',
  '95000000-0000-4000-8000-000000000017'
);
delete from public.tenant_audit_log
where tenant_id in (
  '95000000-0000-4000-8000-000000000021',
  '95000000-0000-4000-8000-000000000022',
  '95000000-0000-4000-8000-000000000023',
  '95000000-0000-4000-8000-000000000024',
  '95000000-0000-4000-8000-000000000025',
  '95000000-0000-4000-8000-000000000026'
)
or actor_id in (
  '95000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000002'
);
delete from public.pro_credentials
where pro_profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from public.pro_commercial_terms
where pro_profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
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
) users(id, email)
on conflict (id) do update set
  email = excluded.email,
  raw_app_meta_data = '{}'::jsonb,
  raw_user_meta_data = '{}'::jsonb,
  updated_at = pg_catalog.now();
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
) rows(id, role, name)
on conflict (id) do update set
  role = excluded.role,
  status = excluded.status,
  full_name = excluded.full_name,
  tenant_id = null,
  updated_at = pg_catalog.now();
insert into public.pro_profiles (profile_id)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
from pg_catalog.generate_series(11, 17) value
on conflict (profile_id) do nothing;
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
from pg_catalog.generate_series(11, 17) value
on conflict (id) do nothing;
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from,
  status, version, created_by
)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad((100 + value * 2 + kind_no)::text, 12, '0'))::uuid,
  ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  kind::public.pro_term_kind, 'per_registration', 10000, current_date - 1,
  'active', 1, '95000000-0000-4000-8000-000000000001'
from pg_catalog.generate_series(11, 17) value
cross join (values (0, 'pricing'), (1, 'compensation')) kinds(kind_no, kind)
on conflict (id) do nothing;
insert into public.tenants (id, name, slug, plan, status)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'Concurrency ' || value, 'concurrency-' || value, 'starter', 'active'
from pg_catalog.generate_series(21, 26) value
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  plan = excluded.plan,
  status = excluded.status;
insert into public.company_profiles (id, tenant_id, company_name, status)
select ('95000000-0000-4000-8000-' || pg_catalog.lpad((value + 10)::text, 12, '0'))::uuid,
  ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'Concurrency Company ' || value, 'active'
from pg_catalog.generate_series(21, 26) value
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  company_name = excluded.company_name,
  status = excluded.status;

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

commit;
select 'assignment_concurrency_ready' as assignment_concurrency_ready;
