\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
select public.lock_company_assignment_resources(
  '99030771-0000-4000-8000-000000000101',
  array['99030771-0000-4000-8000-000000000002'::uuid]
);
select 'BATCH_CANONICAL_LOCK_HELD';
select pg_catalog.pg_sleep(2);
set local role service_role;
select public.create_document_request_batch(
  '99030771-0000-4000-8000-000000000900',
  '99030771-0000-4000-8000-000000000002',
  '99030771-0000-4000-8000-000000000100',
  '99030771-0000-4000-8000-000000000101',
  '[{"doc_type":"passport","label":"Passport"},{"doc_type":"visa","label":"Visa"}]'::jsonb
);
reset role;
commit;
select 'BATCH_SESSION_COMMITTED';
