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
values
  ('93300000-0000-4000-8000-000000000010', 'runtime-fixture', 'Runtime Fixture', 'active'),
  ('93300000-0000-4000-8000-000000000011', 'runtime-fixture-two', 'Runtime Fixture Two', 'active');

insert into public.company_profiles (id, tenant_id, company_name, status)
values
  (
    '93300000-0000-4000-8000-000000000020',
    '93300000-0000-4000-8000-000000000010',
    'Runtime Fixture Company',
    'active'
  ),
  (
    '93300000-0000-4000-8000-000000000021',
    '93300000-0000-4000-8000-000000000011',
    'Runtime Fixture Second Company',
    'active'
  );

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values ('p3_10.runtime_fixture', 1, '{"sequence":"integer"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds
) values
  ('runtime.fixture', 'p3_10.runtime_fixture', 1, 3, 120),
  ('runtime.receipt', 'p3_10.runtime_fixture', 1, 3, 120);

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
    or not has_function_privilege(
      'service_role',
      'public.record_safe_delivery_receipt(uuid,uuid,uuid,uuid,uuid,uuid,uuid,smallint,text,text,text,boolean,text,text,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.write_operational_projection(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,timestamp with time zone,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.cancel_leased_event_job(uuid,uuid,uuid,text)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_safe_delivery_receipt(uuid,uuid,uuid,uuid,uuid,uuid,uuid,smallint,text,text,text,boolean,text,text,text,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
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

create temporary table runtime_receipt_claim as
select * from public.claim_event_jobs(
  '93300000-0000-4000-8000-000000000042', 'runtime.receipt', 1, 120
);
grant select on runtime_receipt_claim to service_role;

set local role service_role;
do $runtime_delivery_receipt_service_role$
declare
  v_claim runtime_receipt_claim%rowtype;
  v_result jsonb;
begin
  select * into strict v_claim from runtime_receipt_claim;

  begin
    perform public.record_safe_delivery_receipt(
      '93300000-0000-4000-8000-000000000061',
      '93300000-0000-4000-8000-000000000010',
      '93300000-0000-4000-8000-000000000020',
      v_claim.event_id, v_claim.job_id,
      '93300000-0000-4000-8000-000000000042', v_claim.lease_token,
      (v_claim.attempt_number + 1)::smallint,
      'sms', 'accepted', 'RUNTIME_ACCEPTED', false, repeat('a', 64),
      'accepted', 'not_applicable', '2026-10-27T00:01:00Z', '2026-10-27T00:01:00Z'
    );
    raise exception 'STALE_DELIVERY_ATTEMPT_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RUNTIME_ATTEMPT_MISMATCH' then raise; end if;
  end;

  v_result := public.record_safe_delivery_receipt(
    '93300000-0000-4000-8000-000000000060',
    '93300000-0000-4000-8000-000000000010',
    '93300000-0000-4000-8000-000000000020',
    v_claim.event_id, v_claim.job_id,
    '93300000-0000-4000-8000-000000000042', v_claim.lease_token,
    v_claim.attempt_number,
    'sms', 'accepted', 'RUNTIME_ACCEPTED', false, repeat('a', 64),
    'accepted', 'not_applicable', '2026-10-27T00:01:00Z', '2026-10-27T00:01:00Z'
  );
  if v_result ->> 'state' <> 'applied' then
    raise exception 'DELIVERY_RECEIPT_NOT_APPLIED';
  end if;

  v_result := public.record_safe_delivery_receipt(
    '93300000-0000-4000-8000-000000000060',
    '93300000-0000-4000-8000-000000000010',
    '93300000-0000-4000-8000-000000000020',
    v_claim.event_id, v_claim.job_id,
    '93300000-0000-4000-8000-000000000042', v_claim.lease_token,
    v_claim.attempt_number,
    'sms', 'accepted', 'RUNTIME_ACCEPTED', false, repeat('a', 64),
    'accepted', 'not_applicable', '2026-10-27T00:01:00Z', '2026-10-27T00:01:00Z'
  );
  if v_result ->> 'state' <> 'replayed' then
    raise exception 'DELIVERY_RECEIPT_NOT_REPLAYED';
  end if;
end;
$runtime_delivery_receipt_service_role$;
reset role;

do $runtime_delivery_receipt_results$
declare
  v_claim runtime_receipt_claim%rowtype;
begin
  select * into strict v_claim from runtime_receipt_claim;
  if exists (
    select 1 from public.operational_runtime_audit
    where operation_id = '93300000-0000-4000-8000-000000000061'
  ) or exists (
    select 1 from public.runtime_delivery_receipts
    where job_id = v_claim.job_id and attempt_number = v_claim.attempt_number + 1
  ) then raise exception 'DELIVERY_RECEIPT_ATOMICITY_FAILED'; end if;

  if (
    select count(*)
    from public.runtime_delivery_receipts as receipt
    join public.operational_runtime_audit as audit
      on audit.resource_id = receipt.id
      and audit.resource_type = 'delivery_receipt'
      and audit.action_code = 'DELIVERY_RECEIPT_RECORDED'
    where receipt.job_id = v_claim.job_id
      and receipt.attempt_number = v_claim.attempt_number
      and audit.operation_id = '93300000-0000-4000-8000-000000000060'
  ) <> 1 then raise exception 'DELIVERY_RECEIPT_ATOMICITY_FAILED'; end if;

  if not public.cancel_leased_event_job(
    v_claim.job_id,
    '93300000-0000-4000-8000-000000000042',
    v_claim.lease_token,
    'RUNTIME_RECEIPT_CANCELLED'
  ) then raise exception 'DELIVERY_RECEIPT_JOB_NOT_CANCELLED'; end if;
end;
$runtime_delivery_receipt_results$;

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

insert into public.operational_notifications (
  id, tenant_id, company_id, recipient_profile_id, source_event_id, source_job_id,
  projection_key, notification_code, severity, safe_metadata
) select
  '93300000-0000-4000-8000-000000000070',
  '93300000-0000-4000-8000-000000000010',
  '93300000-0000-4000-8000-000000000020',
  '93300000-0000-4000-8000-000000000001',
  event_id, job_id, 'runtime.fixture.notification', 'RUNTIME_FIXTURE_NOTIFICATION', 'info', '{}'
from runtime_claim;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"93300000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '93300000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;
do $runtime_role_denial$
declare
  v_result jsonb;
begin
  v_result := public.set_operational_notification_read_state(
    '93300000-0000-4000-8000-000000000020',
    '93300000-0000-4000-8000-000000000070',
    true,
    '93300000-0000-4000-8000-000000000071'
  );
  if v_result ->> 'state' <> 'read' then
    raise exception 'NOTIFICATION_READ_STATE_NOT_APPLIED';
  end if;

  begin
    perform public.set_operational_notification_read_state(
      '93300000-0000-4000-8000-000000000021',
      '93300000-0000-4000-8000-000000000070',
      true,
      '93300000-0000-4000-8000-000000000072'
    );
    raise exception 'NOTIFICATION_CROSS_COMPANY_DENIAL_FAILED';
  exception when insufficient_privilege then
    if sqlerrm <> 'RUNTIME_ACCESS_DENIED' then raise; end if;
  end;

  v_result := public.set_operational_notification_read_state(
    '93300000-0000-4000-8000-000000000020',
    '93300000-0000-4000-8000-000000000070',
    true,
    '93300000-0000-4000-8000-000000000071'
  );
  if v_result ->> 'state' <> 'replayed' then
    raise exception 'NOTIFICATION_READ_STATE_NOT_REPLAYED';
  end if;

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

  begin
    perform public.record_safe_delivery_receipt(
      '93300000-0000-4000-8000-000000000062',
      '93300000-0000-4000-8000-000000000010',
      '93300000-0000-4000-8000-000000000020',
      '93300000-0000-4000-8000-000000000030',
      '93300000-0000-4000-8000-000000000050',
      '93300000-0000-4000-8000-000000000041',
      '93300000-0000-4000-8000-000000000099',
      1::smallint, 'sms', 'accepted', 'RUNTIME_ACCEPTED', false, repeat('a', 64),
      'accepted', 'not_applicable', '2026-10-27T00:01:00Z', '2026-10-27T00:01:00Z'
    );
    raise exception 'AUTHENTICATED_DELIVERY_RECEIPT_EXECUTED';
  exception when insufficient_privilege then
    if sqlerrm not like 'permission denied%' then raise; end if;
  end;
end;
$runtime_role_denial$;
reset role;

do $runtime_role_results$
begin
  if (select read_at is null from public.operational_notifications
      where id = '93300000-0000-4000-8000-000000000070')
    or (select count(*) from public.operational_runtime_audit
        where operation_id = '93300000-0000-4000-8000-000000000071') <> 1
  then raise exception 'NOTIFICATION_READ_STATE_NOT_REPLAYED'; end if;

  if exists (
    select 1 from public.operational_runtime_audit
    where operation_id = '93300000-0000-4000-8000-000000000072'
  ) then raise exception 'NOTIFICATION_CROSS_COMPANY_AUDIT_WRITTEN'; end if;
end;
$runtime_role_results$;

\echo RUNTIME_FIXTURE_ASSERTIONS=26
rollback;
