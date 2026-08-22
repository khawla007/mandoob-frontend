\set ON_ERROR_STOP on
set statement_timeout = '20s';
do $$
declare
  v_attempt integer;
begin
  for v_attempt in 1..150 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69004 and objid = 1 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'RECOVERY_SESSION_A_NOT_READY';
end;
$$;
do $$
begin
  perform public.recover_pro_credential_evidence_removal(
    '95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000011'
  );
  raise exception 'EXPECTED_RENEWED_LEASE';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'EVIDENCE_REMOVAL_LEASE_ACTIVE' then raise; end if;
end;
$$;
