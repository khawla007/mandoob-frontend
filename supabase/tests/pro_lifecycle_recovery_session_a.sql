\set ON_ERROR_STOP on
set statement_timeout = '25s';
begin;
delete from storage.objects where bucket_id = 'tenant-documents' and name = 'pro-credentials/95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000010/95000000-0000-4000-8000-000000000011';
select pg_catalog.pg_advisory_xact_lock(69004, 1);
select pg_sleep(10);
commit;
do $$ begin
  perform public.finalize_pro_credential_evidence_removal('95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000011', 0, '95000000-0000-4000-8000-000000000013', repeat('8', 64));
  raise exception 'EXPECTED_OLD_FINALIZE_FENCE';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
end $$;
