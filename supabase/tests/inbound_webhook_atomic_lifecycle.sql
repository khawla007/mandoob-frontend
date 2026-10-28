\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

insert into public.tenants (id, slug, name, status)
values ('91800000-0000-4000-8000-000000000001', 'inbound-atomic-test', 'Inbound Atomic Test', 'active');

insert into public.tenants (id, slug, name, status)
values ('91800000-0000-4000-8000-000000000020', 'inbound-owner-test', 'Inbound Owner Test', 'active');

insert into public.tenants (id, slug, name, status)
values ('91800000-0000-4000-8000-000000000021', 'inbound-inactive-test', 'Inbound Inactive Test', 'suspended');

insert into public.company_profiles (id, tenant_id, company_name, status)
values
  ('91800000-0000-4000-8000-000000000030', '91800000-0000-4000-8000-000000000001', 'Inbound Active Company', 'active'),
  ('91800000-0000-4000-8000-000000000031', '91800000-0000-4000-8000-000000000020', 'Inbound Inactive Company', 'suspended');

insert into public.inbound_destinations (
  id, provider, destination_key_hash, tenant_id, company_id, enabled
) values (
  '91800000-0000-4000-8000-000000000002',
  'unifonic',
  'v1:' || repeat('a', 64),
  '91800000-0000-4000-8000-000000000001',
  null,
  true
);

insert into public.sms_inbox (tenant_id, from_phone, body, provider_message_id)
values (
  '91800000-0000-4000-8000-000000000001',
  '+971500000000',
  'conflict',
  'retry-event'
);

do $atomic_failure_retry$
declare
  v_result record;
  v_accepted record;
begin
  begin
    perform * from public.accept_inbound_webhook(
      'unifonic', 'sms', 'v1:' || repeat('a', 64), repeat('b', 64), repeat('c', 64),
      pg_catalog.now(), true, '+971501234567', 'STOP', 'retry-event'
    );
    raise exception 'EXPECTED_INBOX_WRITE_FAILURE';
  exception when unique_violation then null;
  end;

  if exists (
    select 1 from public.inbound_webhook_receipts
    where provider_event_id_hash = repeat('b', 64)
  ) then
    raise exception 'FAILED_WRITE_CONSUMED_EVENT_ID';
  end if;

  delete from public.sms_inbox where provider_message_id = 'retry-event';

  select * into v_result from public.accept_inbound_webhook(
    'unifonic', 'sms', 'v1:' || repeat('a', 64), repeat('b', 64), repeat('c', 64),
    pg_catalog.now(), true, '+971501234567', 'STOP', 'retry-event'
  );
  if v_result.outcome <> 'accepted' or v_result.inbox_id is null then
    raise exception 'RETRY_NOT_ACCEPTED_AFTER_ROLLBACK';
  end if;
  v_accepted := v_result;
  if not exists (
    select 1 from public.inbound_webhook_receipts
    where provider_event_id_hash = repeat('b', 64) and status = 'processed'
  ) then
    raise exception 'RECEIPT_NOT_PROCESSED_ATOMICALLY';
  end if;
  if not exists (
    select 1 from public.consent_opt_outs
    where phone_e164 = '+971501234567' and channel = 'sms' and opted_in_at is null
  ) then
    raise exception 'CONSENT_NOT_WRITTEN_ATOMICALLY';
  end if;

  select * into v_result from public.accept_inbound_webhook(
    'unifonic', 'sms', 'v1:' || repeat('a', 64), repeat('b', 64), repeat('c', 64),
    pg_catalog.now(), true, '+971501234567', 'STOP', 'retry-event'
  );
  if v_result.outcome <> 'duplicate' then raise exception 'DUPLICATE_NOT_CLASSIFIED'; end if;
  if v_result.tenant_id is distinct from v_accepted.tenant_id
    or v_result.inbox_id is distinct from v_accepted.inbox_id
    or v_result.received_at is distinct from v_accepted.received_at
    or v_result.routing_key is distinct from v_accepted.routing_key
  then raise exception 'DUPLICATE_ROUTING_REPLAY_UNSTABLE'; end if;

  insert into public.leads (
    id, tenant_id, name, phone, source, stage, routing_reason
  ) values (
    '91800000-0000-4000-8000-000000000050',
    '91800000-0000-4000-8000-000000000001',
    'Inbound Routing Fixture',
    '+971501234567',
    'questionnaire',
    'new',
    'assigned_active_tenant_v1'
  );

  insert into public.lead_events (
    lead_id, tenant_id, event_type, metadata
  ) values (
    '91800000-0000-4000-8000-000000000050',
    '91800000-0000-4000-8000-000000000001',
    'inbound_reply',
    pg_catalog.jsonb_build_object(
      'channel', 'sms',
      'inbound_operation_key', v_result.routing_key::text
    )
  );

  begin
    insert into public.lead_events (
      lead_id, tenant_id, event_type, metadata
    ) values (
      '91800000-0000-4000-8000-000000000050',
      '91800000-0000-4000-8000-000000000001',
      'inbound_reply',
      pg_catalog.jsonb_build_object(
        'channel', 'sms',
        'inbound_operation_key', v_result.routing_key::text
      )
    );
    raise exception 'INBOUND_OPERATION_KEY_NOT_UNIQUE';
  exception when unique_violation then null;
  end;

  select * into v_result from public.accept_inbound_webhook(
    'unifonic', 'sms', 'v1:' || repeat('d', 64), repeat('e', 64), repeat('f', 64),
    pg_catalog.now(), true, '+971501234567', 'help', 'unknown-event'
  );
  if v_result.outcome <> 'unknown' then raise exception 'UNKNOWN_NOT_CLASSIFIED'; end if;

  select * into v_result from public.accept_inbound_webhook(
    'unifonic', 'sms', 'v1:' || repeat('a', 64), repeat('1', 64), repeat('2', 64),
    pg_catalog.now() - interval '6 minutes', true, '+971501234567', 'help', 'stale-event'
  );
  if v_result.outcome <> 'stale' then raise exception 'STALE_NOT_CLASSIFIED'; end if;
end;
$atomic_failure_retry$;

do $destination_provisioning_grants$
begin
  if has_table_privilege('public', 'public.inbound_destination_provisioning_receipts', 'SELECT')
    or has_table_privilege('anon', 'public.inbound_destination_provisioning_receipts', 'SELECT')
    or has_table_privilege('authenticated', 'public.inbound_destination_provisioning_receipts', 'SELECT')
    or has_table_privilege('service_role', 'public.inbound_destination_provisioning_receipts', 'SELECT')
    or has_function_privilege('public', 'public.provision_inbound_destination(text,uuid,uuid,uuid,text,boolean,boolean,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.provision_inbound_destination(text,uuid,uuid,uuid,text,boolean,boolean,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.provision_inbound_destination(text,uuid,uuid,uuid,text,boolean,boolean,uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.provision_inbound_destination(text,uuid,uuid,uuid,text,boolean,boolean,uuid,uuid)', 'EXECUTE')
  then raise exception 'PROVISIONING_GRANT_MISMATCH'; end if;
end;
$destination_provisioning_grants$;

do $destination_provisioning$
declare
  v_a record;
  v_b record;
  v_retry_a record;
begin
  select * into v_a
  from public.provision_inbound_destination(
    'unifonic', '91800000-0000-4000-8000-000000000001', null,
    null, 'v1:' || repeat('7', 64), false, false,
    '91800000-0000-4000-8000-000000000010',
    '91800000-0000-4000-8000-000000000011'
  );
  if v_a.destination_id is null or v_a.enabled or v_a.replayed or exists (
    select 1 from public.inbound_destinations where id = v_a.destination_id and enabled
  ) then raise exception 'PROVISIONING_ENABLED_WITHOUT_READINESS'; end if;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000001', null,
      null, 'v1:' || repeat('8', 64), true, false,
      '91800000-0000-4000-8000-000000000012',
      '91800000-0000-4000-8000-000000000013'
    );
    raise exception 'PROVISIONING_ENABLED_WITHOUT_READINESS';
  exception when check_violation then null;
  end;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000001', null,
      v_a.destination_id, 'v1:' || repeat('9', 64), true, false,
      '91800000-0000-4000-8000-000000000014',
      '91800000-0000-4000-8000-000000000015'
    );
    raise exception 'PROVISIONING_ENABLED_WITHOUT_READINESS';
  exception when check_violation then null;
  end;

  begin
    perform * from public.provision_inbound_destination(
      null, '91800000-0000-4000-8000-000000000001', null,
      null, null, false, false,
      '91800000-0000-4000-8000-000000000022',
      '91800000-0000-4000-8000-000000000023'
    );
    raise exception 'PROVISIONING_NULL_INPUT_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000021', null,
      null, 'v1:' || repeat('4', 64), false, false,
      '91800000-0000-4000-8000-000000000024',
      '91800000-0000-4000-8000-000000000025'
    );
    raise exception 'PROVISIONING_INACTIVE_TENANT_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000020',
      '91800000-0000-4000-8000-000000000031',
      null, 'v1:' || repeat('5', 64), false, false,
      '91800000-0000-4000-8000-000000000026',
      '91800000-0000-4000-8000-000000000027'
    );
    raise exception 'PROVISIONING_INACTIVE_COMPANY_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000020', null,
      null, 'v1:' || repeat('7', 64), false, false,
      '91800000-0000-4000-8000-000000000018',
      '91800000-0000-4000-8000-000000000019'
    );
    raise exception 'PROVISIONING_CROSS_OWNER_HASH_ACCEPTED';
  exception when check_violation then null;
  end;

  select * into v_b
  from public.provision_inbound_destination(
    'unifonic', '91800000-0000-4000-8000-000000000001', null,
    v_a.destination_id, 'v1:' || repeat('9', 64), false, false,
    '91800000-0000-4000-8000-000000000016',
    '91800000-0000-4000-8000-000000000017'
  );
  if v_b.destination_id is distinct from v_a.destination_id or v_b.replayed or not exists (
    select 1 from public.inbound_destinations
    where id = v_a.destination_id and destination_key_hash = 'v1:' || repeat('9', 64)
      and enabled is false
  ) then raise exception 'PROVISIONING_REKEY_FAILED'; end if;

  select * into v_retry_a
  from public.provision_inbound_destination(
    'unifonic', '91800000-0000-4000-8000-000000000001', null,
    null, 'v1:' || repeat('7', 64), false, false,
    '91800000-0000-4000-8000-000000000010',
    '91800000-0000-4000-8000-000000000011'
  );
  if v_retry_a.destination_id is distinct from v_a.destination_id
    or v_retry_a.enabled or not v_retry_a.replayed
    or not exists (
      select 1 from public.inbound_destinations
      where id = v_a.destination_id and destination_key_hash = 'v1:' || repeat('9', 64)
    )
    or (select count(*) from public.inbound_destination_provisioning_receipts
        where operation_id = '91800000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.platform_audit_events
        where operation_id = '91800000-0000-4000-8000-000000000010') <> 1
  then raise exception 'PROVISIONING_STABLE_REPLAY_FAILED'; end if;

  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000001', null,
      null, 'v1:' || repeat('9', 64), false, false,
      '91800000-0000-4000-8000-000000000010',
      '91800000-0000-4000-8000-000000000011'
    );
    raise exception 'PROVISIONING_REPLAY_MISMATCH_ACCEPTED';
  exception when check_violation then
    if sqlerrm <> 'OPERATION_REPLAY_MISMATCH' then raise; end if;
  end;

  if not exists (
    select 1 from public.platform_audit_events
    where event_name = 'integration.inbound_destination_provisioned'
      and operation_id = '91800000-0000-4000-8000-000000000016'
      and tenant_id = '91800000-0000-4000-8000-000000000001'
      and outcome = 'success'
  ) then raise exception 'PROVISIONING_AUDIT_MISSING'; end if;
end;
$destination_provisioning$;

alter table public.platform_audit_events add constraint fixture_reject_provisioning_audit
check (operation_id is distinct from '91800000-0000-4000-8000-000000000040'::uuid);

do $destination_provisioning_audit_rollback$
begin
  begin
    perform * from public.provision_inbound_destination(
      'unifonic', '91800000-0000-4000-8000-000000000001', null,
      null, 'v1:' || repeat('6', 64), false, false,
      '91800000-0000-4000-8000-000000000040',
      '91800000-0000-4000-8000-000000000041'
    );
    raise exception 'PROVISIONING_AUDIT_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.inbound_destinations where destination_key_hash = 'v1:' || repeat('6', 64))
    or exists (select 1 from public.inbound_destination_provisioning_receipts where operation_id = '91800000-0000-4000-8000-000000000040')
  then raise exception 'PROVISIONING_AUDIT_ROLLBACK_NOT_ATOMIC'; end if;
end;
$destination_provisioning_audit_rollback$;

alter table public.platform_audit_events drop constraint fixture_reject_provisioning_audit;

rollback;
