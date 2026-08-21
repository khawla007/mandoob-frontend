\set ON_ERROR_STOP on
set statement_timeout = '10s';
begin;
select public.activate_pro_commercial_term(
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000004', 1,
  '92000000-0000-4000-8000-000000000021', repeat('3', 64)
);
select pg_catalog.pg_advisory_xact_lock(69002, 1);
select pg_sleep(2);
commit;
