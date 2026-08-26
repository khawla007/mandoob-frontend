\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
select public.prepare_pro_credential_evidence_removal(
  '95200000-0000-4000-8000-000000000002', '95200000-0000-4000-8000-000000000020',
  '95200000-0000-4000-8000-000000000021', 0,
  '95200000-0000-4000-8000-000000000022', repeat('3', 64)
);
select pg_catalog.pg_advisory_xact_lock(69007, 2);
select pg_catalog.pg_sleep(5);
commit;
