\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '93100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'event-admin@example.invalid', 'synthetic', pg_catalog.now(),
  '{}', '{}', pg_catalog.now(), pg_catalog.now()
);

insert into public.profiles (id, role, status, full_name)
values ('93100000-0000-4000-8000-000000000001', 'admin', 'active', 'Event Test Admin');

insert into public.tenants (id, slug, name, status)
values
  ('93100000-0000-4000-8000-000000000010', 'event-test-one', 'Event Test One', 'active'),
  ('93100000-0000-4000-8000-000000000011', 'event-test-two', 'Event Test Two', 'active');

insert into public.company_profiles (id, tenant_id, company_name)
values
  ('93100000-0000-4000-8000-000000000020', '93100000-0000-4000-8000-000000000010', 'Event Company One'),
  ('93100000-0000-4000-8000-000000000021', '93100000-0000-4000-8000-000000000011', 'Event Company Two');

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('documents.requested', 1, '{"documentRequestId":"reference"}'),
  ('p3_10.integer', 1, '{"sequence":"integer"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds
) values
  ('notifications.reference', 'documents.requested', 1, 2, 120),
  ('audit.reference', 'documents.requested', 1, 3, 120),
  ('integer.reference', 'p3_10.integer', 1, 1, 120);

do $event_publish_contract$
declare
  v_event_id uuid;
  v_replayed_id uuid;
  v_count bigint;
begin
  v_event_id := public.publish_domain_event(
    '93100000-0000-4000-8000-000000000030', 'documents.requested', 1::smallint,
    '2026-09-21T04:30:00Z',
    '93100000-0000-4000-8000-000000000010',
    '93100000-0000-4000-8000-000000000020',
    '93100000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000031', null,
    'confidential', '{"documentRequestId":"synthetic-reference"}', repeat('a', 64)
  );
  if v_event_id <> '93100000-0000-4000-8000-000000000030' then
    raise exception 'EVENT_ID_NOT_RETURNED';
  end if;

  v_replayed_id := public.publish_domain_event(
    '93100000-0000-4000-8000-000000000030', 'documents.requested', 1::smallint,
    '2026-09-21T04:30:00Z',
    '93100000-0000-4000-8000-000000000010',
    '93100000-0000-4000-8000-000000000020',
    '93100000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000031', null,
    'confidential', '{"documentRequestId":"synthetic-reference"}', repeat('a', 64)
  );
  if v_replayed_id <> v_event_id then raise exception 'EVENT_REPLAY_CHANGED_ID'; end if;

  select count(*) into v_count from public.event_jobs where event_id = v_event_id;
  if v_count <> 2 then raise exception 'EVENT_FANOUT_NOT_IDEMPOTENT'; end if;

  begin
    perform public.publish_domain_event(
      '93100000-0000-4000-8000-000000000032', 'documents.requested', 1::smallint,
      '2026-09-21T04:30:00Z',
      '93100000-0000-4000-8000-000000000010',
      '93100000-0000-4000-8000-000000000020', null,
      '93100000-0000-4000-8000-000000000031', null,
      'confidential', '{"documentRequestId":"different"}', repeat('a', 64)
    );
    raise exception 'EVENT_DEDUPE_MISMATCH_ACCEPTED';
  exception when unique_violation then
    if sqlerrm <> 'EVENT_DEDUPE_CONFLICT' then raise; end if;
  end;

  begin
    perform public.publish_domain_event(
      '93100000-0000-4000-8000-000000000033', 'documents.requested', 2::smallint,
      pg_catalog.now(), null, null, null,
      '93100000-0000-4000-8000-000000000034', null,
      'internal', '{}', repeat('b', 64)
    );
    raise exception 'UNKNOWN_EVENT_VERSION_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'EVENT_VERSION_UNSUPPORTED' then raise; end if;
  end;

  begin
    perform public.publish_domain_event(
      '93100000-0000-4000-8000-000000000035', 'documents.requested', 1::smallint,
      pg_catalog.now(),
      '93100000-0000-4000-8000-000000000010',
      '93100000-0000-4000-8000-000000000021', null,
      '93100000-0000-4000-8000-000000000036', null,
      'internal', '{"documentRequestId":"cross-tenant-reference"}', repeat('c', 64)
    );
    raise exception 'CROSS_TENANT_COMPANY_ACCEPTED';
  exception when foreign_key_violation then null;
  end;

  begin
    perform public.publish_domain_event(
      '93100000-0000-4000-8000-000000000037', 'documents.requested', 1::smallint,
      pg_catalog.now(), null, null, null,
      '93100000-0000-4000-8000-000000000038', null,
      'internal', '{"documentRequestId":"rollback-reference"}', repeat('d', 64)
    );
    raise exception 'FORCED_PRODUCER_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'FORCED_PRODUCER_ROLLBACK' then raise; end if;
  end;
  if exists (select 1 from public.domain_events where id = '93100000-0000-4000-8000-000000000037') then
    raise exception 'PRODUCER_ROLLBACK_NOT_ATOMIC';
  end if;

  begin
    perform public.publish_domain_event(
      '93100000-0000-4000-8000-000000000039', 'documents.requested', 1::smallint,
      pg_catalog.now(), null, null, null,
      '93100000-0000-4000-8000-000000000139', null,
      'confidential', '{"messageBody":"private message","email":"user@example.com"}',
      repeat('9', 64)
    );
    raise exception 'SENSITIVE_EVENT_PAYLOAD_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'EVENT_PAYLOAD_REDACTION_REQUIRED' then raise; end if;
  end;
end;
$event_publish_contract$;

do $event_payload_schema_contract$
declare
  v_payload jsonb;
begin
  foreach v_payload in array array[
    '{"body":"Call 0501234567"}'::jsonb,
    '{"content":"synthetic content"}'::jsonb,
    '{"text":"synthetic text"}'::jsonb,
    '{"contactName":"Synthetic Person"}'::jsonb,
    '{"address":"Synthetic Street"}'::jsonb,
    '{"documentRequestId":"valid-reference","unexpected":true}'::jsonb,
    '{"documentRequestId":42}'::jsonb
  ] loop
    begin
      perform public.publish_domain_event(
        gen_random_uuid(), 'documents.requested', 1::smallint, pg_catalog.now(), null, null, null,
        gen_random_uuid(), null, 'internal', v_payload,
        encode(extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex')
      );
      raise exception 'UNREGISTERED_PAYLOAD_SHAPE_ACCEPTED';
    exception when invalid_parameter_value then
      if sqlerrm <> 'EVENT_PAYLOAD_REDACTION_REQUIRED' then raise; end if;
    end;
  end loop;
end;
$event_payload_schema_contract$;

do $event_integer_contract$
declare
  v_value numeric;
begin
  foreach v_value in array array[-9007199254740991::numeric, 9007199254740991::numeric]
  loop
    perform public.publish_domain_event(
      gen_random_uuid(), 'p3_10.integer', 1::smallint, pg_catalog.now(), null, null, null,
      gen_random_uuid(), null, 'internal', pg_catalog.jsonb_build_object('sequence', v_value),
      encode(extensions.digest(pg_catalog.convert_to(v_value::text, 'UTF8'), 'sha256'), 'hex')
    );
  end loop;

  foreach v_value in array array[-9007199254740992::numeric, 9007199254740992::numeric]
  loop
    begin
      perform public.publish_domain_event(
        gen_random_uuid(), 'p3_10.integer', 1::smallint, pg_catalog.now(), null, null, null,
        gen_random_uuid(), null, 'internal', pg_catalog.jsonb_build_object('sequence', v_value),
        encode(extensions.digest(pg_catalog.convert_to(v_value::text, 'UTF8'), 'sha256'), 'hex')
      );
      raise exception 'UNSAFE_INTEGER_ACCEPTED';
    exception when invalid_parameter_value then
      if sqlerrm <> 'EVENT_PAYLOAD_REDACTION_REQUIRED' then raise; end if;
    end;
  end loop;
end;
$event_integer_contract$;

do $event_worker_contract$
declare
  v_notification record;
  v_audit record;
  v_state text;
begin
  select * into v_notification from public.claim_event_jobs(
    '93100000-0000-4000-8000-000000000040', 'notifications.reference', 1, 120
  );
  select * into v_audit from public.claim_event_jobs(
    '93100000-0000-4000-8000-000000000041', 'audit.reference', 1, 120
  );
  if v_notification.job_id is null or v_audit.job_id is null or v_notification.job_id = v_audit.job_id then
    raise exception 'CLAIM_DID_NOT_ISOLATE_CONSUMERS';
  end if;

  begin
    perform public.complete_event_job(
      v_notification.job_id,
      '93100000-0000-4000-8000-000000000099',
      v_notification.lease_token,
      null
    );
    raise exception 'STALE_WORKER_COMPLETION_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'STALE_EVENT_JOB_LEASE' then raise; end if;
  end;

  perform public.extend_event_job_lease(
    v_notification.job_id,
    '93100000-0000-4000-8000-000000000040',
    v_notification.lease_token,
    120
  );
  v_state := public.fail_event_job(
    v_notification.job_id,
    '93100000-0000-4000-8000-000000000040',
    v_notification.lease_token,
    'provider_unavailable', 'PROVIDER_UNAVAILABLE', true
  );
  if v_state <> 'retryable' then raise exception 'RETRYABLE_FAILURE_NOT_REQUEUED'; end if;

  update public.event_jobs set available_at = pg_catalog.now() - interval '1 second'
  where id = v_notification.job_id;
  select * into v_notification from public.claim_event_jobs(
    '93100000-0000-4000-8000-000000000040', 'notifications.reference', 1, 120
  );
  v_state := public.fail_event_job(
    v_notification.job_id,
    '93100000-0000-4000-8000-000000000040',
    v_notification.lease_token,
    'malformed_payload', 'EVENT_PAYLOAD_INVALID', true
  );
  if v_state <> 'dead' then raise exception 'ATTEMPT_EXHAUSTION_NOT_DEAD'; end if;

  if public.complete_event_job(
    v_audit.job_id,
    '93100000-0000-4000-8000-000000000041',
    v_audit.lease_token,
    repeat('e', 64)
  ) is not true then
    raise exception 'INDEPENDENT_CONSUMER_NOT_COMPLETED';
  end if;

  if not exists (
    select 1 from public.event_job_attempts
    where job_id = v_notification.job_id and transition = 'dead'
  ) then raise exception 'DEAD_ATTEMPT_NOT_AUDITED'; end if;
end;
$event_worker_contract$;

do $event_cancel_contract$
declare
  v_event_id uuid := '93100000-0000-4000-8000-000000000050';
  v_job_id uuid;
begin
  perform public.publish_domain_event(
    v_event_id, 'documents.requested', 1::smallint, pg_catalog.now(), null, null, null,
    '93100000-0000-4000-8000-000000000051', null,
    'internal', '{"documentRequestId":"cancel-reference"}', repeat('f', 64)
  );
  select id into v_job_id from public.event_jobs
  where event_id = v_event_id and consumer_name = 'notifications.reference';
  if public.cancel_event_job(v_job_id, 'DOMAIN_WORK_CANCELLED') is not true then
    raise exception 'PENDING_JOB_NOT_CANCELLED';
  end if;
  if public.cancel_event_job(v_job_id, 'DOMAIN_WORK_CANCELLED') is not false then
    raise exception 'CANCEL_NOT_IDEMPOTENT';
  end if;
end;
$event_cancel_contract$;

do $event_history_contract$
begin
  begin
    update public.domain_events set privacy_class = 'public'
    where id = '93100000-0000-4000-8000-000000000030';
    raise exception 'EVENT_HISTORY_MUTABLE';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'EVENT_HISTORY_IMMUTABLE' then raise; end if;
  end;
  begin
    delete from public.event_job_attempts
    where job_id in (
      select id from public.event_jobs where event_id = '93100000-0000-4000-8000-000000000030'
    );
    raise exception 'ATTEMPT_HISTORY_MUTABLE';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'EVENT_HISTORY_IMMUTABLE' then raise; end if;
  end;
end;
$event_history_contract$;

do $event_grant_contract$
begin
  if has_table_privilege('authenticated', 'public.event_jobs', 'SELECT')
    or has_table_privilege('anon', 'public.domain_events', 'SELECT')
    or has_table_privilege('authenticated', 'public.inbound_destinations', 'INSERT')
    or has_table_privilege('service_role', 'public.event_jobs', 'INSERT')
  then raise exception 'CLIENT_QUEUE_TABLE_PRIVILEGE_PRESENT'; end if;

  if has_function_privilege('authenticated', 'public.claim_event_jobs(uuid,text,integer,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_event_jobs(uuid,text,integer,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.request_event_job_replay(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.event_payload_is_safe(jsonb)', 'EXECUTE')
  then raise exception 'QUEUE_RPC_GRANT_MISMATCH'; end if;
end;
$event_grant_contract$;

insert into public.event_jobs (
  id, event_id, consumer_name, state, attempts, max_attempts,
  last_error_category, last_error_code, dead_at
) values (
  '93100000-0000-4000-8000-000000000063',
  '93100000-0000-4000-8000-000000000030',
  'manual.replay', 'dead', 1, 1,
  'malformed_payload', 'EVENT_PAYLOAD_INVALID', pg_catalog.now()
);

set local request.jwt.claims = '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
set local role authenticated;
do $event_replay_aal1$
begin
  begin
    perform public.request_event_job_replay(
      '93100000-0000-4000-8000-000000000063',
      '93100000-0000-4000-8000-000000000060',
      'Retry after provider reconciliation'
    );
    raise exception 'AAL1_REPLAY_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm <> 'EVENT_REPLAY_NOT_AUTHORIZED' then raise; end if;
  end;
end;
$event_replay_aal1$;
reset role;

set local request.jwt.claims = '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
set local role authenticated;
do $event_replay_aal2$
declare
  v_first uuid;
  v_second uuid;
begin
  v_first := public.request_event_job_replay(
    '93100000-0000-4000-8000-000000000063',
    '93100000-0000-4000-8000-000000000061',
    'Retry after provider reconciliation'
  );
  v_second := public.request_event_job_replay(
    '93100000-0000-4000-8000-000000000063',
    '93100000-0000-4000-8000-000000000061',
    'Retry after provider reconciliation'
  );
  if v_first <> v_second then raise exception 'REPLAY_OPERATION_NOT_IDEMPOTENT'; end if;

  begin
    perform public.request_event_job_replay(
      '93100000-0000-4000-8000-000000000063',
      '93100000-0000-4000-8000-000000000061',
      'Different normalized replay reason'
    );
    raise exception 'REPLAY_OPERATION_MISMATCH_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'EVENT_REPLAY_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.request_event_job_replay(
      '93100000-0000-4000-8000-000000000063',
      '93100000-0000-4000-8000-000000000062',
      'Second concurrent replay request'
    );
    raise exception 'CONCURRENT_REPLAY_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'EVENT_REPLAY_ALREADY_ACTIVE' then raise; end if;
  end;
end;
$event_replay_aal2$;
reset role;

do $event_replay_storage_contract$
begin
  if not exists (
    select 1 from public.event_jobs replay
    join public.event_jobs source on source.id = '93100000-0000-4000-8000-000000000063'
    join public.event_replay_requests request on request.replay_job_id = replay.id
    where request.operation_id = '93100000-0000-4000-8000-000000000061'
      and replay.state = 'replayed'
      and replay.effect_key = source.effect_key
  ) then raise exception 'REPLAY_EFFECT_KEY_NOT_STABLE'; end if;
end;
$event_replay_storage_contract$;

insert into public.inbound_destinations (
  id, provider, destination_key_hash, tenant_id, company_id, enabled
) values (
  '93100000-0000-4000-8000-000000000070', 'twilio', 'v1:' || repeat('1', 64),
  '93100000-0000-4000-8000-000000000010',
  '93100000-0000-4000-8000-000000000020', true
);

do $inbound_webhook_contract$
begin
  begin
    insert into public.inbound_destinations (
      provider, destination_key_hash, tenant_id, company_id, enabled
    ) values (
      'twilio', 'v1:' || repeat('1', 64),
      '93100000-0000-4000-8000-000000000011',
      '93100000-0000-4000-8000-000000000021', true
    );
    raise exception 'DESTINATION_COLLISION_ACCEPTED';
  exception when unique_violation then null;
  end;
  if has_function_privilege(
    'service_role',
    'public.reserve_inbound_webhook(text,text,text,text,timestamptz,boolean)',
    'execute'
  ) then raise exception 'LEGACY_RESERVATION_RPC_STILL_EXECUTABLE'; end if;
end;
$inbound_webhook_contract$;

do $heartbeat_health_contract$
declare
  v_health jsonb;
begin
  if public.record_event_worker_heartbeat(
    '93100000-0000-4000-8000-000000000080',
    'event-worker-1', 'notifications.reference',
    'local.acceptance', 'p3.10-test', pg_catalog.now() - interval '1 minute'
  ) is not true then raise exception 'HEARTBEAT_NOT_RECORDED'; end if;
  v_health := public.read_event_queue_health('notifications.reference');
  if not (v_health ? 'pending_count' and v_health ? 'dead_count'
    and v_health ? 'oldest_due_seconds' and v_health ? 'stale_worker_count')
  then raise exception 'QUEUE_HEALTH_INCOMPLETE'; end if;
end;
$heartbeat_health_contract$;

rollback;
