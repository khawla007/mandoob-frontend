\set ON_ERROR_STOP on
set statement_timeout = '15s';

do $atomic_pair_concurrency_contract$
declare
  v_a double precision;
  v_b double precision;
begin
  select tokens into v_a from public.rate_limits where key = 'atomic-pair-concurrency:a';
  select tokens into v_b from public.rate_limits where key = 'atomic-pair-concurrency:b';
  if v_a is null or v_b is null or v_a < 0 or v_b < 0 or v_a >= 0.000001 or v_b >= 0.000001
  then
    raise exception 'ATOMIC_PAIR_CONCURRENT_CHARGE_NOT_SERIALIZED';
  end if;
end;
$atomic_pair_concurrency_contract$;

delete from public.rate_limits
where key in ('atomic-pair-concurrency:a', 'atomic-pair-concurrency:b');
