\set ON_ERROR_STOP on
set statement_timeout = '15s';

do $delivery_status_concurrency_contract$
declare
  v_status text;
  v_sent_at timestamptz;
  v_delivered_at timestamptz;
begin
  select queue.status, queue.sent_at, queue.delivered_at
  into v_status, v_sent_at, v_delivered_at
  from public.outbound_sms as queue
  where queue.provider = 'twilio'
    and queue.provider_message_id = 'LSW1-CONCURRENT-SMS';
  if v_status <> 'delivered'
    or v_sent_at <> '2026-10-31T03:01:00Z'::timestamptz
    or v_delivered_at <> '2026-10-31T03:02:00Z'::timestamptz
  then
    raise exception 'DELIVERY_STATUS_CONCURRENT_TRANSITIONS_NOT_SERIALIZED';
  end if;
  raise notice 'DELIVERY_STATUS_CONCURRENCY_PASS';
end;
$delivery_status_concurrency_contract$;

delete from public.outbound_sms where provider_message_id = 'LSW1-CONCURRENT-SMS';
delete from public.tenants where id = '93600000-0000-4000-8000-000000000099';
