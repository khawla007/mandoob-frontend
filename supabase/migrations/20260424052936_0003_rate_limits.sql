-- Token-bucket rate limiter (Postgres-backed; no new vendor in Step 1).
create table public.rate_limits (
  key text primary key,
  tokens double precision not null,
  last_refill timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
-- service-role only; no policies.

create or replace function public.rate_limit_consume(
  p_key text,
  p_capacity double precision,
  p_refill_per_sec double precision,
  p_cost double precision default 1
) returns boolean
language plpgsql
as $$
declare
  row record;
  now_ts timestamptz := now();
  elapsed double precision;
  new_tokens double precision;
begin
  insert into public.rate_limits (key, tokens, last_refill)
    values (p_key, p_capacity, now_ts)
    on conflict (key) do nothing;

  select * into row from public.rate_limits where key = p_key for update;

  elapsed := extract(epoch from (now_ts - row.last_refill));
  new_tokens := least(p_capacity, row.tokens + elapsed * p_refill_per_sec);

  if new_tokens < p_cost then
    update public.rate_limits
       set tokens = new_tokens, last_refill = now_ts
     where key = p_key;
    return false;
  end if;

  update public.rate_limits
     set tokens = new_tokens - p_cost, last_refill = now_ts
   where key = p_key;
  return true;
end $$;

revoke execute on function public.rate_limit_consume(text, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.rate_limit_consume(text, double precision, double precision, double precision)
  to service_role;
