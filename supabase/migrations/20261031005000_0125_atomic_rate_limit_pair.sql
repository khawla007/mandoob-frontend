-- Consume two token buckets as one all-or-nothing abuse-control decision.
create or replace function public.rate_limit_consume_pair(
  p_first_key text,
  p_first_capacity double precision,
  p_first_refill_per_sec double precision,
  p_first_cost double precision,
  p_second_key text,
  p_second_capacity double precision,
  p_second_refill_per_sec double precision,
  p_second_cost double precision
) returns jsonb
language plpgsql
set search_path = ''
as $rate_limit_consume_pair$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_row record;
  v_first_tokens double precision;
  v_second_tokens double precision;
  v_first_allowed boolean;
  v_second_allowed boolean;
begin
  if p_first_key is null
    or pg_catalog.btrim(p_first_key) = ''
    or pg_catalog.octet_length(p_first_key) > 256
    or p_second_key is null
    or pg_catalog.btrim(p_second_key) = ''
    or pg_catalog.octet_length(p_second_key) > 256
    or p_first_key = p_second_key
  then
    raise exception using errcode = '22023', message = 'RATE_LIMIT_PAIR_INVALID_KEY';
  end if;

  if p_first_capacity is null
    or p_first_refill_per_sec is null
    or p_first_cost is null
    or p_second_capacity is null
    or p_second_refill_per_sec is null
    or p_second_cost is null
    or not (
    p_first_capacity > 0 and p_first_capacity < 'Infinity'::double precision
    and p_first_refill_per_sec > 0 and p_first_refill_per_sec < 'Infinity'::double precision
    and p_first_cost > 0 and p_first_cost < 'Infinity'::double precision
    and p_second_capacity > 0 and p_second_capacity < 'Infinity'::double precision
    and p_second_refill_per_sec > 0 and p_second_refill_per_sec < 'Infinity'::double precision
    and p_second_cost > 0 and p_second_cost < 'Infinity'::double precision
    )
  then
    raise exception using errcode = '22023', message = 'RATE_LIMIT_PAIR_INVALID_NUMERIC';
  end if;

  insert into public.rate_limits (key, tokens, last_refill)
  select input.key, input.capacity, v_now
  from (
    values
      (p_first_key, p_first_capacity),
      (p_second_key, p_second_capacity)
  ) as input(key, capacity)
  order by input.key
  on conflict (key) do nothing;

  for v_row in
    select limits.key, limits.tokens, limits.last_refill
    from public.rate_limits as limits
    where limits.key in (p_first_key, p_second_key)
    order by limits.key
    for update
  loop
    if v_row.key = p_first_key then
      v_first_tokens := least(
        p_first_capacity,
        v_row.tokens
          + greatest(
            0::double precision,
            extract(epoch from (v_now - v_row.last_refill))::double precision
          )
            * p_first_refill_per_sec
      );
    else
      v_second_tokens := least(
        p_second_capacity,
        v_row.tokens
          + greatest(
            0::double precision,
            extract(epoch from (v_now - v_row.last_refill))::double precision
          )
            * p_second_refill_per_sec
      );
    end if;
  end loop;

  if v_first_tokens is null or v_second_tokens is null then
    raise exception using errcode = '55000', message = 'RATE_LIMIT_PAIR_STATE_UNAVAILABLE';
  end if;

  v_first_allowed := v_first_tokens >= p_first_cost;
  v_second_allowed := v_second_tokens >= p_second_cost;

  update public.rate_limits as limits
  set tokens = case limits.key
      when p_first_key then v_first_tokens - case when v_first_allowed and v_second_allowed then p_first_cost else 0 end
      else v_second_tokens - case when v_first_allowed and v_second_allowed then p_second_cost else 0 end
    end,
    last_refill = v_now
  where key in (p_first_key, p_second_key);

  return pg_catalog.jsonb_build_object(
    'first_allowed', v_first_allowed,
    'second_allowed', v_second_allowed
  );
end;
$rate_limit_consume_pair$;

revoke execute on function public.rate_limit_consume_pair(
  text, double precision, double precision, double precision,
  text, double precision, double precision, double precision
) from public, anon, authenticated;

grant execute on function public.rate_limit_consume_pair(
  text, double precision, double precision, double precision,
  text, double precision, double precision, double precision
) to service_role;
