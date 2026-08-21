\set ON_ERROR_STOP on
set statement_timeout = '10s';
do $$
declare
  v_attempt integer;
begin
  for v_attempt in 1..50 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69001 and objid = 1 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'VERIFY_SESSION_A_NOT_READY';
end;
$$;
do $$
begin
  perform public.verify_pro_credential(
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003', 4,
    '92000000-0000-4000-8000-000000000012', repeat('2', 64)
  );
  raise exception 'EXPECTED_VERIFY_CONFLICT';
exception when others then
  if sqlerrm not in ('STALE_CREDENTIAL_VERSION', 'INVALID_CREDENTIAL_TRANSITION') then raise; end if;
end;
$$;
