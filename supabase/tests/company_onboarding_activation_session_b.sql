\set ON_ERROR_STOP on
set statement_timeout = '10s';
set lock_timeout = '5s';
begin;
select pg_catalog.pg_try_advisory_xact_lock(62001, 1);
select 'ACTIVATION_SESSION_B_BOUNDED' as result;
rollback;
