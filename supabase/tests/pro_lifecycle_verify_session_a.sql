\set ON_ERROR_STOP on
set statement_timeout = '30s';
begin;
select public.verify_pro_credential(
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000003', 4,
  '92000000-0000-4000-8000-000000000011', repeat('1', 64)
);
select pg_catalog.pg_advisory_xact_lock(69001, 1);
select pg_sleep(15);
commit;
