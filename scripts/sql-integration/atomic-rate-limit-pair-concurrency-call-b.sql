\set ON_ERROR_STOP on
set lock_timeout = '5s';
set statement_timeout = '15s';

begin;
with outcome as materialized (
  select public.rate_limit_consume_pair(
    'atomic-pair-concurrency:b', 2, 0.000000001, 1,
    'atomic-pair-concurrency:a', 2, 0.000000001, 1
  ) as result
)
select result ->> 'first_allowed', result ->> 'second_allowed' from outcome;
select pg_catalog.pg_sleep(1);
commit;
