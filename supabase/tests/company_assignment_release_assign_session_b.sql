-- Start while release session A sleeps. The assignment must complete only after
-- release commits, with exactly one live owner and synchronized cached scope.
select :'actor_a_profile_id'::uuid <> :'actor_b_profile_id'::uuid as distinct_actors \gset
\if :distinct_actors
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';

select public.assign_pro_to_company(
  :'company_id'::uuid,
  :'replacement_pro_profile_id'::uuid,
  :'actor_b_profile_id'::uuid
);
\set lifecycle_sqlstate :SQLSTATE
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

select count(*) = 1 as one_active_assignment
from public.pro_company_assignments
where company_id = :'company_id'::uuid and status = 'active' \gset
\if :one_active_assignment
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
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
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) >= 2 as transitions_audited
from public.tenant_audit_log
where action in ('company_pro_released', 'company_pro_assigned')
  and details ->> 'company_id' = :'company_id' \gset
\if :transitions_audited
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
