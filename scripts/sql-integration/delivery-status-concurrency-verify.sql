\set ON_ERROR_STOP on
set statement_timeout = '15s';

do $delivery_status_concurrency_contract$
declare
  v_status text;
  v_delivered_at timestamptz;
  v_error text;
begin
  select queue.status, queue.delivered_at, queue.last_error
  into v_status, v_delivered_at, v_error
  from public.outbound_sms as queue
  where queue.provider = 'twilio'
    and queue.provider_message_id = 'LSW1-CONCURRENT-SMS';
  if v_status <> 'delivered'
    or v_delivered_at <> '2026-10-31T03:02:00Z'::timestamptz
    or v_error is not null
  then
    raise exception 'DELIVERY_STATUS_CONCURRENT_TRANSITIONS_NOT_SERIALIZED';
  end if;
  raise notice 'DELIVERY_STATUS_CONCURRENCY_PASS';
end;
$delivery_status_concurrency_contract$;

delete from public.outbound_sms where provider_message_id = 'LSW1-CONCURRENT-SMS';
delete from public.tenants where id = '93600000-0000-4000-8000-000000000099';
