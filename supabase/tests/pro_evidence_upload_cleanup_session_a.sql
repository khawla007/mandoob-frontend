\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;
select public.finalize_pro_credential_evidence_upload(
  '95100000-0000-4000-8000-000000000001',
  '95100000-0000-4000-8000-000000000010', 0,
  '95100000-0000-4000-8000-000000000011', repeat('1', 64),
  '95100000-0000-4000-8000-000000000011',
  'pro-credentials/95100000-0000-4000-8000-000000000001/95100000-0000-4000-8000-000000000010/95100000-0000-4000-8000-000000000011',
  'application/pdf', 8, repeat('a', 64), 'race.pdf', 'clamav',
  '2026-08-26T10:00:00Z'
);
select pg_catalog.pg_advisory_xact_lock(69006, 1);
select pg_catalog.pg_sleep(5);
commit;
