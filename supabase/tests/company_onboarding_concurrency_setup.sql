\set ON_ERROR_STOP on
set statement_timeout = '10s';
select pg_catalog.pg_advisory_unlock_all();
select 'COMPANY_ONBOARDING_CONCURRENCY_READY' as result;
