-- Start while session A is sleeping. The insert blocks until A commits and must
-- then fail with unique_violation for the same company-scoped lookup hash.
-- Example: psql "$DATABASE_URL" -v tenant_id=... -v company_id=... \
--   -f supabase/tests/employee_passport_uniqueness_session_b.sql
\set ON_ERROR_STOP on
select pg_sleep(1);
select set_config('mandoob.test_tenant_id', :'tenant_id', false);
select set_config('mandoob.test_company_id', :'company_id', false);

do $$
declare
  v_sqlstate text;
  v_constraint_name text;
begin
  begin
    insert into public.employees (
      id, tenant_id, company_id, name, passport_no_hash, status
    ) values (
      '63000000-0000-4000-8000-000000000002',
      current_setting('mandoob.test_tenant_id')::uuid,
      current_setting('mandoob.test_company_id')::uuid,
      'Passport uniqueness fixture B',
      'a' || repeat('0', 63),
      'active'
    );
    raise exception using message = 'EXPECTED_UNIQUE_VIOLATION';
  exception
    when unique_violation then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_constraint_name = constraint_name;
      if v_sqlstate <> '23505'
        or v_constraint_name <> 'employee_company_passport_hash_unique' then
        raise exception using message = 'UNEXPECTED_UNIQUE_CONSTRAINT';
      end if;
  end;
end;
$$;

select count(*) = 1 as exactly_one_employee
from public.employees
where company_id = :'company_id'::uuid
  and passport_no_hash = 'a' || repeat('0', 63) \gset
\if :exactly_one_employee
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

delete from public.employees
where id in (
  '63000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002'
);
