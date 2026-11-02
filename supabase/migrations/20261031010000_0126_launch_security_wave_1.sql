create or replace function public.apply_provider_delivery_status(
  p_channel text,
  p_provider text,
  p_provider_message_id text,
  p_provider_status text,
  p_provider_occurred_at timestamptz default null,
  p_safe_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_channel text := p_channel;
  v_provider text := p_provider;
  v_provider_status text;
  v_target_status text;
  v_target_rank integer;
  v_current_status text;
  v_current_rank integer;
  v_current_terminal boolean;
  v_safe_error_code text;
  v_match_count integer := 0;
  v_target_id bigint;
  v_outcome text;
  v_sms record;
  v_whatsapp record;
begin
  if p_channel is null
    or pg_catalog.octet_length(p_channel) not between 1 and 16
    or v_channel not in ('sms', 'whatsapp')
    or p_provider is null
    or pg_catalog.octet_length(p_provider) not between 1 and 16
    or v_provider not in ('twilio', 'unifonic', 'whatsapp')
    or (v_channel = 'sms' and v_provider not in ('twilio', 'unifonic'))
    or (v_channel = 'whatsapp' and v_provider <> 'whatsapp')
    or p_provider_message_id is null
    or pg_catalog.octet_length(p_provider_message_id) not between 1 and 255
    or p_provider_status is null
    or pg_catalog.octet_length(p_provider_status) not between 1 and 64
  then
    v_outcome := 'unknown';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;
  v_provider_status := pg_catalog.lower(p_provider_status);

  if v_channel = 'sms' then
    case v_provider_status
      when 'queued' then v_target_status := 'pending'; v_target_rank := 0;
      when 'accepted' then v_target_status := 'pending'; v_target_rank := 0;
      when 'scheduled' then v_target_status := 'pending'; v_target_rank := 0;
      when 'sending' then v_target_status := 'pending'; v_target_rank := 0;
      when 'pending' then v_target_status := 'pending'; v_target_rank := 0;
      when 'sent' then v_target_status := 'sent'; v_target_rank := 10;
      when 'delivered' then v_target_status := 'delivered'; v_target_rank := 20;
      when 'read' then v_target_status := 'delivered'; v_target_rank := 20;
      when 'failed' then v_target_status := 'failed'; v_target_rank := 30;
      when 'undelivered' then v_target_status := 'dead'; v_target_rank := 30;
      when 'canceled' then v_target_status := 'dead'; v_target_rank := 30;
      when 'rejected' then v_target_status := 'dead'; v_target_rank := 30;
      when 'expired' then v_target_status := 'dead'; v_target_rank := 30;
      when 'dead' then v_target_status := 'dead'; v_target_rank := 30;
      else
        v_outcome := 'unknown';
        return pg_catalog.jsonb_build_object('outcome', v_outcome);
    end case;
  else
    case v_provider_status
      when 'pending' then v_target_status := 'pending'; v_target_rank := 0;
      when 'sent' then v_target_status := 'sent'; v_target_rank := 10;
      when 'delivered' then v_target_status := 'delivered'; v_target_rank := 20;
      when 'read' then v_target_status := 'read'; v_target_rank := 30;
      when 'failed' then v_target_status := 'failed'; v_target_rank := 40;
      when 'dead' then v_target_status := 'dead'; v_target_rank := 40;
      else
        v_outcome := 'unknown';
        return pg_catalog.jsonb_build_object('outcome', v_outcome);
    end case;
  end if;

  if p_safe_error_code ~ '^[A-Za-z0-9_.:-]{1,64}$' then
    v_safe_error_code := p_safe_error_code;
  else
    v_safe_error_code := null;
  end if;

  if v_channel = 'sms' then
    for v_sms in
      select queue.id, queue.status, queue.sent_at, queue.delivered_at
      from public.outbound_sms as queue
      where queue.provider = v_provider
        and queue.provider_message_id = p_provider_message_id
      order by queue.id
      for update
    loop
      v_match_count := v_match_count + 1;
      v_target_id := v_sms.id;
      v_current_status := v_sms.status;
    end loop;
  else
    for v_whatsapp in
      select queue.id, queue.status, queue.sent_at, queue.delivered_at, queue.read_at
      from public.outbound_whatsapp as queue
      where queue.provider_message_id = p_provider_message_id
      order by queue.id
      for update
    loop
      v_match_count := v_match_count + 1;
      v_target_id := v_whatsapp.id;
      v_current_status := v_whatsapp.status;
    end loop;
  end if;

  if v_match_count <> 1 then
    v_outcome := 'not_found';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;

  if v_channel = 'sms' then
    v_current_rank := case v_current_status
      when 'pending' then 0
      when 'sent' then 10
      when 'delivered' then 20
      when 'failed' then 30
      when 'dead' then 30
      else 2147483647
    end;
  else
    v_current_rank := case v_current_status
      when 'pending' then 0
      when 'sent' then 10
      when 'delivered' then 20
      when 'read' then 30
      when 'failed' then 40
      when 'dead' then 40
      else 2147483647
    end;
  end if;
  v_current_terminal := v_current_status in ('failed', 'dead');

  if v_current_status = v_target_status then
    v_outcome := 'replayed';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;
  if v_channel = 'sms' and v_current_status = 'delivered' then
    v_outcome := 'stale';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;
  if v_channel = 'whatsapp'
    and v_current_status = 'delivered'
    and v_target_status in ('failed', 'dead')
  then
    v_outcome := 'stale';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;
  if v_channel = 'whatsapp' and v_current_status = 'read' then
    v_outcome := 'stale';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;
  if v_current_terminal or v_target_rank < v_current_rank then
    v_outcome := 'stale';
    return pg_catalog.jsonb_build_object('outcome', v_outcome);
  end if;

  if v_channel = 'sms' then
    update public.outbound_sms as queue
    set status = v_target_status,
        sent_at = coalesce(
          queue.sent_at,
          case when v_target_status = 'sent' then p_provider_occurred_at end,
          case when v_target_status = 'sent' then pg_catalog.clock_timestamp() end
        ),
        delivered_at = coalesce(
          queue.delivered_at,
          case when v_target_status = 'delivered' then
            greatest(coalesce(p_provider_occurred_at, pg_catalog.clock_timestamp()), queue.sent_at)
          end,
          case when v_target_status = 'delivered' then pg_catalog.clock_timestamp() end
        ),
        last_error = case
          when v_target_status in ('failed', 'dead') and v_safe_error_code is not null
            then v_safe_error_code
          else queue.last_error
        end
    where queue.id = v_target_id;
  else
    update public.outbound_whatsapp as queue
    set status = v_target_status,
        sent_at = coalesce(
          queue.sent_at,
          case when v_target_status = 'sent' then p_provider_occurred_at end,
          case when v_target_status = 'sent' then pg_catalog.clock_timestamp() end
        ),
        delivered_at = coalesce(
          queue.delivered_at,
          case when v_target_status = 'delivered' then
            greatest(coalesce(p_provider_occurred_at, pg_catalog.clock_timestamp()), queue.sent_at)
          end,
          case when v_target_status = 'delivered' then pg_catalog.clock_timestamp() end
        ),
        read_at = coalesce(
          queue.read_at,
          case when v_target_status = 'read' then
            greatest(
              coalesce(p_provider_occurred_at, pg_catalog.clock_timestamp()),
              queue.delivered_at,
              queue.sent_at
            )
          end,
          case when v_target_status = 'read' then pg_catalog.clock_timestamp() end
        ),
        last_error = case
          when v_target_status in ('failed', 'dead') and v_safe_error_code is not null
            then v_safe_error_code
          else queue.last_error
        end
    where queue.id = v_target_id;
  end if;

  v_outcome := 'applied';
  return pg_catalog.jsonb_build_object('outcome', v_outcome);
end;
$function$;

alter function public.apply_provider_delivery_status(text,text,text,text,timestamptz,text)
  owner to postgres;
revoke all on function public.apply_provider_delivery_status(text,text,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.apply_provider_delivery_status(text,text,text,text,timestamptz,text)
  to service_role;
