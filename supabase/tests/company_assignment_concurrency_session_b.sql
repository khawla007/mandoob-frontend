-- Session B must lose with the exact stable lifecycle code after session A commits.
\set ON_ERROR_STOP off
select pg_catalog.set_config('application_name', :'session_b_name', false);
select :'actor_a_profile_id'::uuid <> :'actor_b_profile_id'::uuid as distinct_actors \gset
\if :distinct_actors
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';
select pg_catalog.set_config('task11.expected_error', :'expected_error', true);
select pg_catalog.set_config('task11.company_b_id', :'company_b_id', true);
select pg_catalog.set_config('task11.pro_b_profile_id', :'pro_b_profile_id', true);
select pg_catalog.set_config('task11.actor_b_profile_id', :'actor_b_profile_id', true);

do $$
begin
  perform public.assign_pro_to_company(
    pg_catalog.current_setting('task11.company_b_id')::uuid,
    pg_catalog.current_setting('task11.pro_b_profile_id')::uuid,
    pg_catalog.current_setting('task11.actor_b_profile_id')::uuid
  );
  raise exception 'EXPECTED_ERROR_NOT_RAISED';
exception when sqlstate 'P0001' then
  if sqlerrm <> pg_catalog.current_setting('task11.expected_error') then raise; end if;
end;
$$;
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

select count(*) = 1 as one_winner
from public.pro_company_assignments
where status = 'active'
  and (
    company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid)
    or pro_profile_id in (:'pro_a_profile_id'::uuid, :'pro_b_profile_id'::uuid)
  ) \gset
\if :one_winner
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 1
  and bool_and(
    profile.tenant_id = assignment.tenant_id
    and auth_user.raw_app_meta_data ->> 'tenant_id' = assignment.tenant_id::text
  ) as scope_synchronized
from public.pro_company_assignments assignment
join public.profiles profile on profile.id = assignment.pro_profile_id
join auth.users auth_user on auth_user.id = profile.id
where assignment.status = 'active'
  and (
    assignment.company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid)
    or assignment.pro_profile_id in (:'pro_a_profile_id'::uuid, :'pro_b_profile_id'::uuid)
  ) \gset
\if :scope_synchronized
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 1 as term_links_preserved
from public.pro_assignment_term_links links
join public.pro_company_assignments assignment on assignment.id = links.assignment_id
where assignment.status = 'active'
  and (
    assignment.company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid)
    or assignment.pro_profile_id in (:'pro_a_profile_id'::uuid, :'pro_b_profile_id'::uuid)
  ) \gset
\if :term_links_preserved
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 0 as immutable_history
from public.pro_company_assignments
where status = 'released'
  and company_id in (:'company_a_id'::uuid, :'company_b_id'::uuid) \gset
\if :immutable_history
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif

select count(*) = 1 as assignment_audited
from public.tenant_audit_log
where action = 'company_pro_assigned'
  and details ->> 'company_id' in (:'company_a_id', :'company_b_id')
  and details ->> 'pro_profile_id' in (:'pro_a_profile_id', :'pro_b_profile_id') \gset
\if :assignment_audited
\else
  \set ON_ERROR_STOP on
  select 1 / 0;
\endif
