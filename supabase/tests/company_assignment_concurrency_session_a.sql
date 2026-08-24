-- Run in session A with psql variables for an unassigned company, verified PRO,
-- and active admin actor. The sleep keeps transaction-scoped advisory locks held.
-- Example:
-- psql "$DATABASE_URL" -v company_id=... -v pro_profile_id=... -v actor_a_profile_id=... \
--   -f supabase/tests/company_assignment_concurrency_session_a.sql
\set ON_ERROR_STOP off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

select public.assign_pro_to_company(
  :'company_a_id'::uuid,
  :'pro_a_profile_id'::uuid,
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
