\set ON_ERROR_STOP on
set statement_timeout = '30s';
do $$
declare
  v_attempt integer;
begin
  for v_attempt in 1..200 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69003 and objid = 1 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'REMOVAL_SESSION_A_NOT_READY';
end;
$$;
do $$
begin
  perform public.prepare_pro_credential_evidence_removal(
    '92000000-0000-4000-8000-000000000040',
    '92000000-0000-4000-8000-000000000030',
    '92000000-0000-4000-8000-000000000031', 0,
    '92000000-0000-4000-8000-000000000033', repeat('6', 64)
  );
  raise exception 'EXPECTED_REMOVAL_CONFLICT';
exception when others then
  if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
end;
$$;
