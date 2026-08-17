-- Start session B while session A is sleeping.
-- For the company race, use the same company_id and a different verified PRO.
-- For the PRO race, use a different company_id and the same pro_profile_id.
-- Expected after session A commits: COMPANY_ALREADY_ASSIGNED or
-- PRO_ALREADY_ASSIGNED respectively; no second active ledger row is created.
-- Example:
-- psql "$DATABASE_URL" -v company_id=... -v pro_profile_id=... -v actor_b_profile_id=... \
--   -f supabase/tests/company_assignment_concurrency_session_b.sql
\set ON_ERROR_STOP off
select :'actor_a_profile_id'::uuid <> :'actor_b_profile_id'::uuid as distinct_actors \gset
\if :distinct_actors
\else
  \quit 1
\endif
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';

select public.assign_pro_to_company(
  :'company_id'::uuid,
  :'pro_profile_id'::uuid,
  :'actor_b_profile_id'::uuid
);
\set lifecycle_sqlstate :SQLSTATE

rollback;

select :'lifecycle_sqlstate' = 'P0001' as expected_lifecycle_state,
  :'lifecycle_sqlstate' not in ('40P01', '55P03', '57014') as no_concurrency_failure \gset
\if :no_concurrency_failure
\else
  \quit 1
\endif
\if :expected_lifecycle_state
\else
  \quit 1
\endif

select count(*) = 1 as one_active_assignment
from public.pro_company_assignments
where company_id = :'company_id'::uuid and status = 'active' \gset
\if :one_active_assignment
\else
  \quit 1
\endif

select count(*) = 1
  and bool_and(
    p.tenant_id = a.tenant_id
    and u.raw_app_meta_data ->> 'tenant_id' = a.tenant_id::text
  ) as scope_synchronized
from public.pro_company_assignments a
join public.profiles p on p.id = a.pro_profile_id
join auth.users u on u.id = p.id
where a.company_id = :'company_id'::uuid and a.status = 'active' \gset
\if :scope_synchronized
\else
  \quit 1
\endif

select count(*) >= 1 as assignment_audited
from public.tenant_audit_log
where action = 'company_pro_assigned'
  and details ->> 'company_id' = :'company_id' \gset
\if :assignment_audited
\else
  \quit 1
\endif
