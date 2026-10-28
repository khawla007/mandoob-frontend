\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '93300000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'runtime-fixture@example.invalid', 'synthetic',
  pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()
);

insert into public.profiles (id, role, status, full_name)
values ('93300000-0000-4000-8000-000000000001', 'admin', 'active', 'Runtime Fixture');

insert into public.tenants (id, slug, name, status)
values ('93300000-0000-4000-8000-000000000010', 'runtime-fixture', 'Runtime Fixture', 'active');

insert into public.company_profiles (id, tenant_id, company_name, status)
values (
  '93300000-0000-4000-8000-000000000020',
  '93300000-0000-4000-8000-000000000010',
  'Runtime Fixture Company',
  'active'
);

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values ('p3_10.runtime_fixture', 1, '{"sequence":"integer"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds
) values ('runtime.fixture', 'p3_10.runtime_fixture', 1, 3, 120);

select public.publish_domain_event(
  '93300000-0000-4000-8000-000000000030', 'p3_10.runtime_fixture', 1::smallint,
  '2026-10-27T00:00:00Z',
  '93300000-0000-4000-8000-000000000010',
  '93300000-0000-4000-8000-000000000020',
  '93300000-0000-4000-8000-000000000001',
  '93300000-0000-4000-8000-000000000031', null,
  'internal', '{"sequence":1}', repeat('3', 64)
);

do $runtime_catalog_and_grants$
begin
  if to_regprocedure(
    'public.write_operational_projection(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,timestamp with time zone,jsonb)'
  ) is null
    or to_regprocedure('public.cancel_leased_event_job(uuid,uuid,uuid,text)') is null
    or to_regprocedure(
      'public.record_safe_delivery_receipt(uuid,uuid,uuid,uuid,uuid,uuid,uuid,smallint,text,text,text,boolean,text,text,text,timestamp with time zone,timestamp with time zone)'
    ) is null
  then raise exception 'RUNTIME_RPC_SIGNATURE_MISSING'; end if;

  if not has_function_privilege(
      'service_role',
      'public.write_operational_projection(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,timestamp with time zone,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role', 'public.cancel_leased_event_job(uuid,uuid,uuid,text)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.write_operational_projection(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,timestamp with time zone,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.cancel_leased_event_job(uuid,uuid,uuid,text)', 'EXECUTE'
    )
  then raise exception 'RUNTIME_RPC_GRANT_BOUNDARY_INVALID'; end if;
end;
$runtime_catalog_and_grants$;

create temporary table runtime_claim as
select * from public.claim_event_jobs(
  '93300000-0000-4000-8000-000000000040', 'runtime.fixture', 1, 120
);

do $runtime_projection_and_fence$
declare
  v_claim runtime_claim%rowtype;
  v_result jsonb;
begin
  select * into strict v_claim from runtime_claim;

  v_result := public.write_operational_projection(
    v_claim.job_id,
    '93300000-0000-4000-8000-000000000010',
    '93300000-0000-4000-8000-000000000020',
    v_claim.event_id, v_claim.job_id,
    '93300000-0000-4000-8000-000000000040', v_claim.lease_token,
    'task', 'runtime.fixture.task', 'RUNTIME_FIXTURE_TASK', null,
    'open', 'high', '2026-10-28T00:00:00Z', '{"sequence":1}'
  );
  if v_result ->> 'state' <> 'applied' then
    raise exception 'RUNTIME_PROJECTION_NOT_APPLIED';
  end if;

  begin
    perform public.write_operational_projection(
      v_claim.job_id,
      '93300000-0000-4000-8000-000000000010',
      '93300000-0000-4000-8000-000000000020',
      v_claim.event_id, v_claim.job_id,
      '93300000-0000-4000-8000-000000000040',
      '93300000-0000-4000-8000-000000000099',
      'task', 'runtime.fixture.task', 'RUNTIME_FIXTURE_TASK', null,
      'open', 'high', '2026-10-28T00:00:00Z', '{"sequence":1}'
    );
    raise exception 'STALE_RUNTIME_LEASE_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm <> 'RUNTIME_REFERENCE_SCOPE_DENIED' then raise; end if;
  end;

  if public.cancel_leased_event_job(
    v_claim.job_id,
    '93300000-0000-4000-8000-000000000099',
    v_claim.lease_token,
    'RUNTIME_FIXTURE_CANCELLED'
  ) then raise exception 'WRONG_RUNTIME_WORKER_CANCELLED'; end if;

  if not public.cancel_leased_event_job(
    v_claim.job_id,
    '93300000-0000-4000-8000-000000000040',
    v_claim.lease_token,
    'RUNTIME_FIXTURE_CANCELLED'
  ) then raise exception 'LEASED_RUNTIME_JOB_NOT_CANCELLED'; end if;
end;
$runtime_projection_and_fence$;

insert into public.event_jobs (
  id, event_id, consumer_name, state, max_attempts, replay_of_job_id
) select
  '93300000-0000-4000-8000-000000000050', event_id, consumer_name, 'replayed', max_attempts, job_id
from runtime_claim;

create temporary table runtime_replay_claim as
select * from public.claim_event_jobs(
  '93300000-0000-4000-8000-000000000041', 'runtime.fixture', 1, 120
);

do $runtime_replay_and_cancel$
declare
  v_original runtime_claim%rowtype;
  v_replay runtime_replay_claim%rowtype;
  v_result jsonb;
begin
  select * into strict v_original from runtime_claim;
  select * into strict v_replay from runtime_replay_claim;

  v_result := public.write_operational_projection(
    v_original.job_id,
    '93300000-0000-4000-8000-000000000010',
    '93300000-0000-4000-8000-000000000020',
    v_replay.event_id, v_replay.job_id,
    '93300000-0000-4000-8000-000000000041', v_replay.lease_token,
    'task', 'runtime.fixture.task', 'RUNTIME_FIXTURE_TASK', null,
    'open', 'high', '2026-10-28T00:00:00Z', '{"sequence":1}'
  );
  if not (v_result @> pg_catalog.jsonb_build_object('state', 'replayed')) then
    raise exception 'RUNTIME_PROJECTION_NOT_REPLAYED';
  end if;

  if (select count(*) from public.operational_tasks
      where source_event_id = v_replay.event_id and projection_key = 'runtime.fixture.task') <> 1
  then raise exception 'RUNTIME_REPLAY_DUPLICATED_PROJECTION'; end if;

  if not public.cancel_leased_event_job(
    v_replay.job_id,
    '93300000-0000-4000-8000-000000000041',
    v_replay.lease_token,
    'RUNTIME_REPLAY_CANCELLED'
  ) then raise exception 'REPLAY_RUNTIME_JOB_NOT_CANCELLED'; end if;

  if exists (
    select 1 from public.event_jobs
    where id in (v_original.job_id, v_replay.job_id)
      and (state <> 'cancelled' or lease_owner is not null or lease_token is not null
        or lease_expires_at is not null)
  ) then raise exception 'RUNTIME_CANCEL_DID_NOT_CLEAR_LEASE'; end if;

  if (select count(*) from public.event_job_attempts
      where job_id in (v_original.job_id, v_replay.job_id) and transition = 'cancelled') <> 2
  then raise exception 'RUNTIME_CANCEL_ATTEMPT_NOT_RECORDED'; end if;
end;
$runtime_replay_and_cancel$;

set local role authenticated;
do $runtime_role_denial$
begin
  begin
    perform public.cancel_leased_event_job(
      '93300000-0000-4000-8000-000000000050',
      '93300000-0000-4000-8000-000000000041',
      '93300000-0000-4000-8000-000000000099',
      'AUTHENTICATED_MUST_NOT_EXECUTE'
    );
    raise exception 'AUTHENTICATED_RUNTIME_RPC_EXECUTED';
  exception when insufficient_privilege then
    if sqlerrm not like 'permission denied%' then raise; end if;
  end;
end;
$runtime_role_denial$;
reset role;

\echo RUNTIME_FIXTURE_ASSERTIONS=14
rollback;
