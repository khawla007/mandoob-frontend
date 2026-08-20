-- Start with an active assignment. Session A releases it and holds the company
-- and old-PRO transaction locks so session B must wait before assigning anew.
\set ON_ERROR_STOP off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

select public.release_company_pro(
  :'company_id'::uuid,
  :'assignment_id'::uuid,
  'coordinated release fixture',
  :'actor_a_profile_id'::uuid
);
\set lifecycle_sqlstate :SQLSTATE

select pg_sleep(8);
commit;

select :'lifecycle_sqlstate' = '00000' as expected_lifecycle_state,
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
