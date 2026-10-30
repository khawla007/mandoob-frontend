\set ON_ERROR_STOP on
begin;
set local lock_timeout='8s';
set local statement_timeout='15s';
select public.release_company_pro(
  '99030771-0000-4000-8000-000000000101',
  '99030771-0000-4000-8000-000000000110',
  'Contention regression release',
  '99030771-0000-4000-8000-000000000001'
);
commit;
select 'RELEASE_SESSION_COMMITTED';
