\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

insert into public.tenants (id, slug, name, status)
values ('93600000-0000-4000-8000-000000000001', 'launch-security-wave-1', 'Launch Security Wave 1', 'active');

insert into public.outbound_sms (
  tenant_id, template_id, to_phone, body, provider, sender_id, status,
  provider_message_id, scheduled_for
) values
  ('93600000-0000-4000-8000-000000000001', 'fixture', '+966500000001', 'synthetic', 'twilio', 'fixture', 'pending', 'LSW1-SMS-FORWARD', '2026-10-31T00:00:00Z'),
  ('93600000-0000-4000-8000-000000000001', 'fixture', '+966500000002', 'synthetic', 'unifonic', 'fixture', 'pending', 'LSW1-SMS-TERMINAL', '2026-10-31T00:00:01Z'),
  ('93600000-0000-4000-8000-000000000001', 'fixture', '+966500000003', 'synthetic', 'twilio', 'fixture', 'pending', 'LSW1-SMS-UNSAFE', '2026-10-31T00:00:02Z'),
  ('93600000-0000-4000-8000-000000000001', 'fixture', '+966500000004', 'synthetic', 'twilio', 'fixture', 'pending', 'LSW1-SMS-UNKNOWN', '2026-10-31T00:00:03Z');

insert into public.outbound_whatsapp (
  tenant_id, template_id, meta_template_name, meta_template_lang, to_phone,
  components, status, provider_message_id, scheduled_for
) values
  ('93600000-0000-4000-8000-000000000001', 'fixture', 'fixture', 'en', '+966500000011', '[]', 'pending', 'LSW1-WA-FORWARD', '2026-10-31T00:00:10Z'),
  ('93600000-0000-4000-8000-000000000001', 'fixture', 'fixture', 'en', '+966500000012', '[]', 'pending', 'LSW1-WA-TERMINAL', '2026-10-31T00:00:11Z');

do $sms_forward_contract$
declare
  v_result jsonb;
  v_status text;
  v_sent_at timestamptz;
  v_delivered_at timestamptz;
  v_error text;
begin
  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-FORWARD', 'Sent', '2026-10-31T01:00:00Z', null
  );
  select queue.status, queue.sent_at into v_status, v_sent_at
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-FORWARD';
  if v_result <> '{"outcome":"applied"}'::jsonb
    or v_status <> 'sent'
    or v_sent_at <> '2026-10-31T01:00:00Z'::timestamptz
  then raise exception 'SMS_FORWARD_APPLIED'; end if;
  raise notice 'SMS_FORWARD_APPLIED';

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-FORWARD', 'delivered', '2026-10-31T01:05:00Z', null
  );
  if v_result <> '{"outcome":"applied"}'::jsonb then
    raise exception 'SMS_DELIVERY_NOT_APPLIED';
  end if;

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-FORWARD', 'delivered', '2026-10-31T01:10:00Z', null
  );
  select queue.delivered_at into v_delivered_at
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-FORWARD';
  if v_result <> '{"outcome":"replayed"}'::jsonb
    or v_delivered_at <> '2026-10-31T01:05:00Z'::timestamptz
  then raise exception 'SMS_REPLAYED'; end if;
  raise notice 'SMS_REPLAYED';
  raise notice 'TIMESTAMPS_PRESERVED';

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-FORWARD', 'sent', '2026-10-31T00:59:00Z', null
  );
  if v_result <> '{"outcome":"stale"}'::jsonb then raise exception 'SMS_STALE_REJECTED'; end if;
  raise notice 'SMS_STALE_REJECTED';

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-FORWARD', 'failed', '2026-10-31T01:06:00Z', '30003'
  );
  select queue.status, queue.delivered_at, queue.last_error
  into v_status, v_delivered_at, v_error
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-FORWARD';
  if v_result <> '{"outcome":"stale"}'::jsonb
    or v_status <> 'delivered'
    or v_delivered_at <> '2026-10-31T01:05:00Z'::timestamptz
    or v_error is not null
  then raise exception 'SMS_SUCCESS_TERMINAL_PROTECTED'; end if;
  raise notice 'SMS_SUCCESS_TERMINAL_PROTECTED';
end;
$sms_forward_contract$;

do $sms_terminal_contract$
declare
  v_result jsonb;
  v_status text;
  v_error text;
begin
  v_result := public.apply_provider_delivery_status(
    'sms', 'unifonic', 'LSW1-SMS-TERMINAL', 'failed', null, 'UNIFONIC_17'
  );
  select queue.status, queue.last_error into v_status, v_error
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-TERMINAL';
  if v_result <> '{"outcome":"applied"}'::jsonb
    or v_status <> 'failed'
    or v_error <> 'UNIFONIC_17'
  then raise exception 'SAFE_ERROR_CODE_ONLY'; end if;
  raise notice 'SAFE_ERROR_CODE_ONLY';

  v_result := public.apply_provider_delivery_status(
    'sms', 'unifonic', 'LSW1-SMS-TERMINAL', 'delivered', null, null
  );
  if v_result <> '{"outcome":"stale"}'::jsonb then
    raise exception 'SMS_TERMINAL_PROTECTED';
  end if;
  raise notice 'SMS_TERMINAL_PROTECTED';

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-UNSAFE', 'failed', null, 'provider rejected: secret body'
  );
  select queue.last_error into v_error
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-UNSAFE';
  if v_result <> '{"outcome":"applied"}'::jsonb or v_error is not null then
    raise exception 'UNSAFE_ERROR_TEXT_STORED';
  end if;
end;
$sms_terminal_contract$;

do $whatsapp_contract$
declare
  v_result jsonb;
  v_status text;
  v_sent_at timestamptz;
  v_delivered_at timestamptz;
  v_read_at timestamptz;
  v_error text;
begin
  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'sent', '2026-10-31T02:00:00Z', null
  );
  if v_result <> '{"outcome":"applied"}'::jsonb then raise exception 'WHATSAPP_FORWARD_APPLIED'; end if;
  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'delivered', null, null
  );
  if v_result <> '{"outcome":"applied"}'::jsonb then raise exception 'WHATSAPP_DELIVERY_NOT_APPLIED'; end if;
  select queue.sent_at, queue.delivered_at into v_sent_at, v_delivered_at
  from public.outbound_whatsapp as queue where queue.provider_message_id = 'LSW1-WA-FORWARD';
  if v_delivered_at is null or v_delivered_at <= v_sent_at then
    raise exception 'CALLBACK_CLOCK_FALLBACK';
  end if;
  raise notice 'CALLBACK_CLOCK_FALLBACK';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'failed',
    v_delivered_at + interval '1 minute', 'META_131026'
  );
  select queue.status, queue.delivered_at, queue.last_error
  into v_status, v_delivered_at, v_error
  from public.outbound_whatsapp as queue where queue.provider_message_id = 'LSW1-WA-FORWARD';
  if v_result <> '{"outcome":"stale"}'::jsonb
    or v_status <> 'delivered'
    or v_error is not null
  then raise exception 'WHATSAPP_DELIVERED_FAILURE_REJECTED'; end if;
  raise notice 'WHATSAPP_DELIVERED_FAILURE_REJECTED';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'read', '2026-10-31T02:02:00Z', null
  );
  select queue.status, queue.read_at into v_status, v_read_at
  from public.outbound_whatsapp as queue where queue.provider_message_id = 'LSW1-WA-FORWARD';
  if v_result <> '{"outcome":"applied"}'::jsonb
    or v_status <> 'read'
    or v_read_at < v_delivered_at
  then raise exception 'WHATSAPP_FORWARD_APPLIED'; end if;
  raise notice 'WHATSAPP_FORWARD_APPLIED';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'read', '2026-10-31T02:03:00Z', null
  );
  if v_result <> '{"outcome":"replayed"}'::jsonb then raise exception 'WHATSAPP_REPLAYED'; end if;
  raise notice 'WHATSAPP_REPLAYED';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'dead', null, 'META_131026'
  );
  select queue.status, queue.read_at, queue.last_error into v_status, v_read_at, v_error
  from public.outbound_whatsapp as queue where queue.provider_message_id = 'LSW1-WA-FORWARD';
  if v_result <> '{"outcome":"stale"}'::jsonb
    or v_status <> 'read'
    or v_error is not null
  then raise exception 'WHATSAPP_READ_TERMINAL_PROTECTED'; end if;
  raise notice 'WHATSAPP_READ_TERMINAL_PROTECTED';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-FORWARD', 'sent', null, null
  );
  if v_result <> '{"outcome":"stale"}'::jsonb then raise exception 'WHATSAPP_STALE_REJECTED'; end if;
  raise notice 'WHATSAPP_STALE_REJECTED';

  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-TERMINAL', 'failed', null, 'META_131026'
  );
  if v_result <> '{"outcome":"applied"}'::jsonb then raise exception 'WHATSAPP_FAILURE_NOT_APPLIED'; end if;
  v_result := public.apply_provider_delivery_status(
    'whatsapp', 'whatsapp', 'LSW1-WA-TERMINAL', 'delivered', null, null
  );
  if v_result <> '{"outcome":"stale"}'::jsonb then
    raise exception 'WHATSAPP_TERMINAL_PROTECTED';
  end if;
  raise notice 'WHATSAPP_TERMINAL_PROTECTED';
end;
$whatsapp_contract$;

do $redacted_outcome_contract$
declare
  v_result jsonb;
  v_status text;
begin
  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-SMS-UNKNOWN', 'provider-invented-state', null, null
  );
  select queue.status into v_status
  from public.outbound_sms as queue where queue.provider_message_id = 'LSW1-SMS-UNKNOWN';
  if v_result <> '{"outcome":"unknown"}'::jsonb or v_status <> 'pending' then
    raise exception 'UNKNOWN_ACKNOWLEDGED';
  end if;
  raise notice 'UNKNOWN_ACKNOWLEDGED';

  v_result := public.apply_provider_delivery_status(
    'sms', 'twilio', 'LSW1-NOT-FOUND', 'sent', null, null
  );
  if v_result <> '{"outcome":"not_found"}'::jsonb then
    raise exception 'NOT_FOUND_REDACTED';
  end if;
  raise notice 'NOT_FOUND_REDACTED';
end;
$redacted_outcome_contract$;

do $delivery_acl_contract$
declare
  v_signature text := 'public.apply_provider_delivery_status(text,text,text,text,timestamptz,text)';
begin
  if pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'ANON_EXECUTE_DENIED';
  end if;
  raise notice 'ANON_EXECUTE_DENIED';
  if pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'AUTHENTICATED_EXECUTE_DENIED';
  end if;
  raise notice 'AUTHENTICATED_EXECUTE_DENIED';
  if not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'SERVICE_ROLE_EXECUTE_ALLOWED';
  end if;
  raise notice 'SERVICE_ROLE_EXECUTE_ALLOWED';
  raise notice 'LAUNCH_SECURITY_WAVE_1_PASS';
end;
$delivery_acl_contract$;

rollback;
