\set ON_ERROR_STOP on
set statement_timeout = '25s';
begin;
select pg_catalog.set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'tenant-documents' and name = 'pro-credentials/95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000010/95000000-0000-4000-8000-000000000011';
select pg_catalog.set_config('storage.allow_delete_query', 'false', true);
select pg_catalog.pg_advisory_xact_lock(69004, 1);
select pg_sleep(10);
commit;
do $$ declare v_attempt integer; begin
  for v_attempt in 1..150 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69004 and objid = 2 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'RECOVERY_SESSION_B_NOT_READY';
end $$;
do $$ begin
  perform public.finalize_pro_credential_evidence_removal('95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000011', 0, '95000000-0000-4000-8000-000000000013', repeat('8', 64));
  raise exception 'EXPECTED_OLD_FINALIZE_FENCE';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
end $$;
