-- Start while swap session A sleeps. Both calls should reject the already-active
-- replacement without deadlock; rollback expected failed transactions first.
\set ON_ERROR_STOP off
select :'actor_a_profile_id'::uuid <> :'actor_b_profile_id'::uuid as distinct_actors \gset
\if :distinct_actors
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';

select public.reassign_company_pro(
  :'company_b_id'::uuid,
  :'assignment_b_id'::uuid,
  :'pro_a_profile_id'::uuid,
  'swap race fixture b',
  :'actor_b_profile_id'::uuid
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

select count(*) = 2 and bool_and(active_count = 1) as one_active_assignment
from (
  select company_id, count(*) as active_count
  from public.pro_company_assignments
  where company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid)
    and status = 'active'
  group by company_id
) active_companies \gset
\if :one_active_assignment
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 2
  and bool_and(
    p.tenant_id = a.tenant_id
    and u.raw_app_meta_data ->> 'tenant_id' = a.tenant_id::text
  ) as scope_synchronized
from public.pro_company_assignments a
join public.profiles p on p.id = a.pro_profile_id
join auth.users u on u.id = p.id
where a.company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid)
  and a.status = 'active' \gset
\if :scope_synchronized
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 0 as failed_swaps_not_audited
from public.tenant_audit_log
where details ->> 'company_id' in (:'company_a_id', :'company_b_id')
  and details ->> 'reason' in ('swap race fixture a', 'swap race fixture b') \gset
\if :failed_swaps_not_audited
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
