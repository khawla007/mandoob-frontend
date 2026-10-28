-- P3.13 forward fix: route inbound replies with exact, bounded database predicates.

begin;

create function public.normalize_lead_phone(p_phone text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  with stripped as (
    select pg_catalog.regexp_replace(pg_catalog.btrim(p_phone), '[^0-9]', '', 'g') as digits
  ), international as (
    select case when digits like '00%' then pg_catalog.substr(digits, 3) else digits end as digits
    from stripped
  )
  select nullif(
    case
      when digits like '0%' and pg_catalog.length(digits) = 10
        then '971' || pg_catalog.substr(digits, 2)
      else digits
    end,
    ''
  )
  from international;
$$;

create index lead_phone_normalized_match_idx
  on public.leads(tenant_id, public.normalize_lead_phone(phone))
  where phone is not null;

create function public.route_inbound_reply_to_lead(
  p_tenant_id uuid,
  p_channel text,
  p_inbox_id text,
  p_operation_key text,
  p_from_phone text,
  p_body text,
  p_provider_message_id text,
  p_received_at timestamptz
)
returns table (
  status text,
  lead_id uuid,
  ambiguous boolean,
  candidate_lead_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity_key text;
  v_identity_value text;
  v_normalized_phone text;
  v_existing public.lead_events%rowtype;
  v_candidate_ids uuid[];
  v_candidate_count integer;
  v_ambiguous boolean;
  v_winner uuid;
begin
  if p_tenant_id is null
    or p_channel is null
    or p_channel not in ('sms', 'whatsapp')
    or p_inbox_id is null
    or pg_catalog.btrim(p_inbox_id) = ''
  then
    raise exception using errcode = '23514', message = 'INVALID_LEAD_REPLY_ROUTE';
  end if;

  v_normalized_phone := public.normalize_lead_phone(p_from_phone);
  if v_normalized_phone is null then
    return query select 'unmatched'::text, null::uuid, false, array[]::uuid[];
    return;
  end if;

  if p_operation_key is not null and pg_catalog.btrim(p_operation_key) <> '' then
    v_identity_key := 'inbound_operation_key';
    v_identity_value := p_operation_key;
  elsif p_provider_message_id is not null and pg_catalog.btrim(p_provider_message_id) <> '' then
    v_identity_key := 'provider_message_id';
    v_identity_value := p_provider_message_id;
  else
    v_identity_key := 'inbox_id';
    v_identity_value := p_inbox_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_tenant_id::text || ':' || p_channel || ':' || v_identity_key || ':' || v_identity_value,
      0
    )
  );

  if v_identity_key = 'inbound_operation_key' then
    select event.* into v_existing
    from public.lead_events event
    where event.tenant_id = p_tenant_id
      and event.event_type = 'inbound_reply'
      and event.metadata ->> 'channel' = p_channel
      and event.metadata ->> 'inbound_operation_key' = v_identity_value;
  elsif v_identity_key = 'provider_message_id' then
    select event.* into v_existing
    from public.lead_events event
    where event.tenant_id = p_tenant_id
      and event.event_type = 'inbound_reply'
      and event.metadata ->> 'channel' = p_channel
      and event.metadata ->> 'provider_message_id' = v_identity_value;
  else
    select event.* into v_existing
    from public.lead_events event
    where event.tenant_id = p_tenant_id
      and event.event_type = 'inbound_reply'
      and event.metadata ->> 'channel' = p_channel
      and event.metadata ->> 'inbox_id' = v_identity_value;
  end if;

  if v_existing.id is not null then
    v_ambiguous := coalesce((v_existing.metadata ->> 'ambiguous')::boolean, false);
    if v_ambiguous then
      select coalesce(pg_catalog.array_agg(candidate.value::uuid), array[]::uuid[])
      into v_candidate_ids
      from pg_catalog.jsonb_array_elements_text(
        coalesce(v_existing.metadata -> 'candidate_lead_ids', '[]'::jsonb)
      ) candidate(value);
    else
      v_candidate_ids := array[v_existing.lead_id];
    end if;
    return query select 'routed'::text, v_existing.lead_id, v_ambiguous, v_candidate_ids;
    return;
  end if;

  select
    pg_catalog.array_agg(candidate.id order by candidate.is_open desc, candidate.created_at desc, candidate.id),
    pg_catalog.count(*)::integer
  into v_candidate_ids, v_candidate_count
  from (
    select
      lead.id,
      lead.created_at,
      lead.stage in ('new', 'contacted', 'qualified') as is_open
    from public.leads lead
    where lead.tenant_id = p_tenant_id
      and lead.phone is not null
      and public.normalize_lead_phone(lead.phone) = v_normalized_phone
    order by is_open desc, lead.created_at desc, lead.id
    limit 101
  ) candidate;

  if v_candidate_count = 0 then
    return query select 'unmatched'::text, null::uuid, false, array[]::uuid[];
    return;
  end if;
  if v_candidate_count > 100 then
    raise exception using errcode = '54000', message = 'LEAD_REPLY_CANDIDATE_LIMIT';
  end if;

  v_winner := v_candidate_ids[1];
  v_ambiguous := v_candidate_count > 1;
  insert into public.lead_events (
    lead_id, tenant_id, actor_id, event_type, from_value, to_value, note, metadata
  ) values (
    v_winner, p_tenant_id, null, 'inbound_reply', p_from_phone, p_channel, p_body,
    pg_catalog.jsonb_build_object(
      'channel', p_channel,
      'inbox_id', p_inbox_id,
      'from_phone', p_from_phone,
      'body_preview', pg_catalog.left(coalesce(p_body, ''), 500),
      'provider_message_id', p_provider_message_id,
      'inbound_operation_key', p_operation_key,
      'received_at', p_received_at,
      'routed_status', 'routed',
      'ambiguous', v_ambiguous,
      'candidate_lead_ids', case
        when v_ambiguous then pg_catalog.to_jsonb(v_candidate_ids)
        else '[]'::jsonb
      end
    )
  );

  return query select 'routed'::text, v_winner, v_ambiguous, v_candidate_ids;
end;
$$;

revoke all on function public.route_inbound_reply_to_lead(
  uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.route_inbound_reply_to_lead(
  uuid, text, text, text, text, text, text, timestamptz
) to service_role;

commit;
