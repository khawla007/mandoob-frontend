\set ON_ERROR_STOP on
set statement_timeout = '30s';
begin;
select public.prepare_pro_credential_evidence_removal(
  '92000000-0000-4000-8000-000000000040',
  '92000000-0000-4000-8000-000000000030',
  '92000000-0000-4000-8000-000000000031', 0,
  '92000000-0000-4000-8000-000000000032', repeat('5', 64)
);
select pg_catalog.pg_advisory_xact_lock(69003, 1);
select pg_sleep(15);
commit;
