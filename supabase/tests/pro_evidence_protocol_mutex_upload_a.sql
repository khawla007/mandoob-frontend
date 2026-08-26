\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
select public.prepare_pro_credential_evidence_upload(
  '95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000010', 0,
  '95200000-0000-4000-8000-000000000012', repeat('1', 64),
  '95200000-0000-4000-8000-000000000012',
  'pro-credentials/95200000-0000-4000-8000-000000000001/95200000-0000-4000-8000-000000000010/95200000-0000-4000-8000-000000000012',
  'application/pdf', 8, repeat('c', 64), 'new.pdf', 'clamav', now()
);
select pg_catalog.pg_advisory_xact_lock(69007, 1);
select pg_catalog.pg_sleep(5);
commit;
