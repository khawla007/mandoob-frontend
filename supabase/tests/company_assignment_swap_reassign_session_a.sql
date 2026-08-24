-- Two active companies attempt to swap PROs. Holding the shared sorted PRO lock
-- set makes the opposing session exercise the same global acquisition order.
\set ON_ERROR_STOP off
select pg_catalog.set_config('application_name', :'session_a_name', false);
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';

select public.lock_company_assignment_resources(
  :'company_a_id'::uuid,
  array[:'pro_a_profile_id'::uuid, :'pro_b_profile_id'::uuid]
);
\ir company_assignment_wait_for_contender.sql

select public.reassign_company_pro(
  :'company_a_id'::uuid,
  :'assignment_a_id'::uuid,
  :'pro_b_profile_id'::uuid,
  'swap race fixture a',
  :'actor_a_profile_id'::uuid
);
\set lifecycle_sqlstate :SQLSTATE
rollback;

select :'lifecycle_sqlstate' = 'P0001' as expected_lifecycle_state,
  :'lifecycle_sqlstate' not in ('40P01', '55P03', '57014') as no_concurrency_failure \gset
\if :no_concurrency_failure
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
\if :expected_lifecycle_state
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
