-- P3.13 forward fix: persist replayable lead-routing identity with each accepted inbox receipt.

begin;

alter table public.inbound_webhook_receipts
  add column channel text,
  add column tenant_id uuid references public.tenants(id) on delete restrict,
  add column inbox_id bigint,
  add column inbox_received_at timestamptz;

update public.inbound_webhook_receipts receipt
set channel = 'sms',
    tenant_id = destination.tenant_id,
    inbox_id = inbox.id,
    inbox_received_at = inbox.received_at
from public.inbound_destinations destination,
     public.sms_inbox inbox
where receipt.destination_id = destination.id
  and receipt.provider in ('twilio', 'unifonic')
  and inbox.tenant_id = destination.tenant_id
  and receipt.provider_event_id_hash = pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(inbox.provider_message_id, 'UTF8'), 'sha256'),
    'hex'
  );

update public.inbound_webhook_receipts receipt
set channel = 'whatsapp',
    tenant_id = destination.tenant_id,
    inbox_id = inbox.id,
    inbox_received_at = inbox.received_at
from public.inbound_destinations destination,
     public.whatsapp_inbox inbox
where receipt.destination_id = destination.id
  and receipt.provider = 'whatsapp'
  and inbox.tenant_id = destination.tenant_id
  and inbox.wamid is not null
  and receipt.provider_event_id_hash = pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(inbox.wamid, 'UTF8'), 'sha256'),
    'hex'
  );

alter table public.inbound_webhook_receipts
  add constraint inbound_webhook_routing_shape check (
    (channel is null and tenant_id is null and inbox_id is null and inbox_received_at is null)
    or (
      channel in ('sms', 'whatsapp')
      and tenant_id is not null
      and inbox_id is not null
      and inbox_received_at is not null
    )
  );

create or replace function public.reject_inbound_receipt_routing_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.channel is not null and (
    new.channel is distinct from old.channel
    or new.tenant_id is distinct from old.tenant_id
    or new.inbox_id is distinct from old.inbox_id
    or new.inbox_received_at is distinct from old.inbox_received_at
  ) then
    raise exception using errcode = '55000', message = 'INBOUND_RECEIPT_ROUTING_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger inbound_webhook_receipts_routing_immutable
before update on public.inbound_webhook_receipts
for each row execute function public.reject_inbound_receipt_routing_mutation();

revoke all on function public.reject_inbound_receipt_routing_mutation()
from public, anon, authenticated, service_role;

create unique index lead_events_inbound_operation_key_uniq
  on public.lead_events(
    tenant_id,
    (metadata ->> 'channel'),
    (metadata ->> 'inbound_operation_key')
  )
  where event_type = 'inbound_reply'
    and metadata ->> 'inbound_operation_key' is not null;

drop function public.accept_inbound_webhook(
  text, text, text, text, text, timestamptz, boolean, text, text, text
);

create function public.accept_inbound_webhook(
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
  received_at timestamptz,
  routing_key uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destination_id uuid;
  v_tenant_id uuid;
  v_receipt public.inbound_webhook_receipts%rowtype;
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
    return query select 'rejected'::text, null::uuid, null::bigint, null::timestamptz, null::uuid;
    return;
  end if;

  if p_occurred_at is null
    or p_occurred_at < pg_catalog.now() - interval '5 minutes'
    or p_occurred_at > pg_catalog.now() + interval '5 minutes'
  then
    return query select 'stale'::text, null::uuid, null::bigint, null::timestamptz, null::uuid;
    return;
  end if;

  select destination.id, destination.tenant_id
  into v_destination_id, v_tenant_id
  from public.inbound_destinations destination
  where destination.provider = p_provider
    and destination.destination_key_hash = p_destination_key_hash
    and destination.enabled;
  if not found then
    return query select 'unknown'::text, null::uuid, null::bigint, null::timestamptz, null::uuid;
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
  returning receipt.* into v_receipt;

  if v_receipt.id is null then
    select receipt.*
    into v_receipt
    from public.inbound_webhook_receipts receipt
    where receipt.provider = p_provider
      and receipt.destination_id = v_destination_id
      and receipt.provider_event_id_hash = p_provider_event_id_hash;

    if not found
      or v_receipt.payload_hash <> p_payload_hash
      or v_receipt.status <> 'processed'
      or v_receipt.channel is distinct from p_channel
      or v_receipt.tenant_id is null
      or v_receipt.inbox_id is null
      or v_receipt.inbox_received_at is null
    then
      return query select 'rejected'::text, null::uuid, null::bigint, null::timestamptz, null::uuid;
      return;
    end if;

    return query select
      'duplicate'::text,
      v_receipt.tenant_id,
      v_receipt.inbox_id,
      v_receipt.inbox_received_at,
      v_receipt.id;
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

  update public.inbound_webhook_receipts receipt
  set status = 'processed',
      processed_at = pg_catalog.now(),
      channel = p_channel,
      tenant_id = v_tenant_id,
      inbox_id = v_inbox_id,
      inbox_received_at = v_received_at
  where receipt.id = v_receipt.id;

  return query select
    'accepted'::text,
    v_tenant_id,
    v_inbox_id,
    v_received_at,
    v_receipt.id;
end;
$$;

revoke all on function public.accept_inbound_webhook(
  text, text, text, text, text, timestamptz, boolean, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.accept_inbound_webhook(
  text, text, text, text, text, timestamptz, boolean, text, text, text
) to service_role;

commit;
