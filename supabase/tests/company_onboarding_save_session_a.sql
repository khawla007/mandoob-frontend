\set ON_ERROR_STOP on
set statement_timeout = '10s';
set lock_timeout = '5s';
begin;
select pg_catalog.pg_advisory_xact_lock(62002, 1);
select 'SAVE_SESSION_A_LOCKED' as result;
rollback;
