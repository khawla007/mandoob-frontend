-- P3.13: COALESCE is SQL syntax and must not be schema-qualified.

create or replace function public.accept_inbound_webhook(
  p_provider text,
  p_channel text,
  p_destination_key_hash text,
  p_provider_event_id_hash text,
  p_payload_hash text,
  p_occurred_at timestamptz,
  p_signature_verified boolean,
  p_from_phone text,
  p_body text,
  p_provider_event_id text
)
returns table (
  outcome text,
  tenant_id uuid,
  inbox_id bigint,
  received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destination_id uuid;
  v_tenant_id uuid;
  v_receipt_id uuid;
  v_inbox_id bigint;
  v_received_at timestamptz;
  v_keyword text;
begin
  if p_signature_verified is not true
    or p_destination_key_hash !~ '^v1:[a-f0-9]{64}$'
    or p_provider_event_id_hash !~ '^[a-f0-9]{64}$'
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_from_phone is null
    or pg_catalog.btrim(p_from_phone) = ''
    or p_provider_event_id is null
    or pg_catalog.btrim(p_provider_event_id) = ''
    or not (
      (p_provider in ('twilio', 'unifonic') and p_channel = 'sms')
      or (p_provider = 'whatsapp' and p_channel = 'whatsapp')
    )
  then
    return query select 'rejected'::text, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  if p_occurred_at is null
    or p_occurred_at < pg_catalog.now() - interval '5 minutes'
    or p_occurred_at > pg_catalog.now() + interval '5 minutes'
  then
    return query select 'stale'::text, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  select destination.id, destination.tenant_id
  into v_destination_id, v_tenant_id
  from public.inbound_destinations destination
  where destination.provider = p_provider
    and destination.destination_key_hash = p_destination_key_hash
    and destination.enabled;
  if not found then
    return query select 'unknown'::text, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  insert into public.inbound_webhook_receipts as receipt (
    provider,
    destination_id,
    provider_event_id_hash,
    payload_hash,
    occurred_at
  ) values (
    p_provider,
    v_destination_id,
    p_provider_event_id_hash,
    p_payload_hash,
    p_occurred_at
  )
  on conflict on constraint inbound_webhook_provider_event_unique do nothing
  returning receipt.id into v_receipt_id;

  if v_receipt_id is null then
    return query select 'duplicate'::text, v_tenant_id, null::bigint, null::timestamptz;
    return;
  end if;

  if p_channel = 'sms' then
    insert into public.sms_inbox as inbox (tenant_id, from_phone, body, provider_message_id)
    values (v_tenant_id, p_from_phone, p_body, p_provider_event_id)
    returning inbox.id, inbox.received_at into v_inbox_id, v_received_at;
  else
    insert into public.whatsapp_inbox as inbox (tenant_id, from_phone, body, wamid)
    values (v_tenant_id, p_from_phone, p_body, p_provider_event_id)
    returning inbox.id, inbox.received_at into v_inbox_id, v_received_at;
  end if;

  v_keyword := pg_catalog.upper(pg_catalog.btrim(coalesce(p_body, '')));
  if v_keyword in ('STOP', 'UNSUBSCRIBE', 'END', 'CANCEL', 'QUIT') then
    insert into public.consent_opt_outs (
      phone_e164,
      channel,
      opted_out_at,
      opted_in_at,
      source,
      last_inbound_message_id
    ) values (
      p_from_phone,
      p_channel,
      pg_catalog.now(),
      null,
      'inbound_keyword',
      p_provider_event_id
    )
    on conflict (phone_e164, channel) where opted_in_at is null
    do update set
      opted_out_at = excluded.opted_out_at,
      source = excluded.source,
      last_inbound_message_id = excluded.last_inbound_message_id;
  elsif v_keyword in ('START', 'UNSTOP', 'SUBSCRIBE', 'RESUME') then
    update public.consent_opt_outs
    set opted_in_at = pg_catalog.now(),
        source = 'inbound_keyword',
        last_inbound_message_id = p_provider_event_id
    where phone_e164 = p_from_phone
      and channel = p_channel
      and opted_in_at is null;
  end if;

  update public.inbound_webhook_receipts
  set status = 'processed',
      processed_at = pg_catalog.now()
  where id = v_receipt_id;

  return query select 'accepted'::text, v_tenant_id, v_inbox_id, v_received_at;
end;
$$;
