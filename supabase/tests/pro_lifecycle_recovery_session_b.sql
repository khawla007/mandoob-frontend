\set ON_ERROR_STOP on
set statement_timeout = '25s';
do $$ declare v_attempt integer; begin
  for v_attempt in 1..150 loop
    if exists (select 1 from pg_catalog.pg_locks where locktype = 'advisory' and classid = 69004 and objid = 1 and granted) then return; end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'RECOVERY_SESSION_A_NOT_READY';
end $$;
select public.claim_pro_credential_evidence_removal_recovery('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000014');
delete from storage.objects where bucket_id = 'tenant-documents' and name = 'pro-credentials/95000000-0000-4000-8000-000000000002/95000000-0000-4000-8000-000000000010/95000000-0000-4000-8000-000000000011';
select public.finalize_pro_credential_evidence_removal_recovery('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000014');
