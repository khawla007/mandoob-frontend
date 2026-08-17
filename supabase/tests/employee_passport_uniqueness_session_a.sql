-- Run concurrently with session B using an existing tenant and company pair.
-- Example: psql "$DATABASE_URL" -v tenant_id=... -v company_id=... \
--   -f supabase/tests/employee_passport_uniqueness_session_a.sql
\set ON_ERROR_STOP on

-- Remove only prior fixture rows in the requested ownership scope. A fixed ID
-- collision outside this scope remains visible and aborts instead of being deleted.
delete from public.employees
where id in (
  '63000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002'
)
  and tenant_id = :'tenant_id'::uuid
  and company_id = :'company_id'::uuid;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

insert into public.employees (
  id, tenant_id, company_id, name, passport_no_hash, status
) values (
  '63000000-0000-4000-8000-000000000001',
  :'tenant_id'::uuid,
  :'company_id'::uuid,
  'Passport uniqueness fixture A',
  'a' || repeat('0', 63),
  'active'
);

select pg_sleep(8);
commit;
