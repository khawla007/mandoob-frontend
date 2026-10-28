\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

insert into public.tenants (id, slug, name, status)
values ('91800000-0000-4000-8000-000000000001', 'inbound-atomic-test', 'Inbound Atomic Test', 'active');

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

rollback;
