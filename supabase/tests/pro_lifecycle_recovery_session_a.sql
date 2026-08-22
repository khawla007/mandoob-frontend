\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
select public.prepare_pro_credential_evidence_removal(
  '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010',
  '95000000-0000-4000-8000-000000000011', 0,
  '95000000-0000-4000-8000-000000000013', repeat('8', 64)
);
select pg_catalog.pg_advisory_xact_lock(69004, 1);
select pg_sleep(10);
commit;
