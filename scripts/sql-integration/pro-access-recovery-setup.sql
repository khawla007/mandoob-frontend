\set ON_ERROR_STOP on

-- Synthetic identities mirror only the cardinality and domain-routing shape that
-- migration 0087 expects. They are not copied from a production export.
begin;

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'operator@fixture.mandoob.local'),
  ('10000000-0000-4000-8000-000000000002', 'access@firm.mandoob.local'),
  ('10000000-0000-4000-8000-000000000003', 'access@nova.mandoob.local');

insert into public.tenants (id, slug, name, status)
values (
  '20000000-0000-4000-8000-000000000001',
  'recovery-fixture',
  'Recovery Fixture Company',
  'active'
);

insert into public.profiles (id, tenant_id, role, status, full_name)
values
  (
    '10000000-0000-4000-8000-000000000001',
    null,
    'super_admin',
    'active',
    'Fixture Operator'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    null,
    'pro',
    'active',
    'Fixture Firm PRO'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    null,
    'pro',
    'active',
    'Fixture Nova PRO'
  );

insert into public.company_profiles (
  id,
  tenant_id,
  company_name,
  status
) values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Recovery Fixture Company',
  'active'
);

commit;
