\set ON_ERROR_STOP on
set statement_timeout = '30s';
do $$
declare
  v_attempt integer;
begin
  for v_attempt in 1..200 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69002 and objid = 1 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'TERM_SESSION_A_NOT_READY';
end;
$$;
do $$
begin
  perform public.activate_pro_commercial_term(
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000004', 1,
    '92000000-0000-4000-8000-000000000022', repeat('4', 64)
  );
  raise exception 'EXPECTED_TERM_CONFLICT';
exception when others then
  if sqlerrm not in ('STALE_TERM_VERSION', 'INVALID_TERM_TRANSITION') then raise; end if;
end;
$$;
