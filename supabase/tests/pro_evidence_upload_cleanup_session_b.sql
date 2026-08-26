\set ON_ERROR_STOP on
set statement_timeout = '20s';
do $$ declare v_attempt integer; begin
  for v_attempt in 1..100 loop
    if exists (
      select 1 from pg_catalog.pg_locks
      where locktype = 'advisory' and classid = 69006 and objid = 1 and granted
    ) then return; end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  raise exception 'UPLOAD_FINALIZER_NOT_READY';
end $$;
begin;
do $$ declare v_claims jsonb; begin
  v_claims := public.claim_pro_credential_evidence_upload_cleanup(
    '95100000-0000-4000-8000-000000000020', 25
  );
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_claims) claim
    where claim ->> 'reservationId' = '95100000-0000-4000-8000-000000000012'
  ) then raise exception 'CLEANUP_CLAIMED_CONCURRENT_FINALIZATION'; end if;
end $$;
rollback;
do $$ begin
  perform public.prepare_pro_credential_evidence_upload(
    '95100000-0000-4000-8000-000000000001',
    '95100000-0000-4000-8000-000000000010', 0,
    '95100000-0000-4000-8000-000000000021', repeat('2', 64),
    '95100000-0000-4000-8000-000000000021',
    'pro-credentials/95100000-0000-4000-8000-000000000001/95100000-0000-4000-8000-000000000010/95100000-0000-4000-8000-000000000021',
    'application/pdf', 8, repeat('b', 64), 'new.pdf', 'clamav', now()
  );
  raise exception 'NEW_OPERATION_FINALIZED_ALONGSIDE_OLD';
exception when others then
  if sqlerrm <> 'STALE_CREDENTIAL_VERSION' then raise; end if;
end $$;
do $$ begin
  if not exists (
    select 1 from public.pro_credential_evidence
    where id = '95100000-0000-4000-8000-000000000011'
  ) or exists (
    select 1 from public.pro_credential_evidence
    where id = '95100000-0000-4000-8000-000000000021'
  ) then raise exception 'CONCURRENT_FINALIZATION_OUTCOME_UNSAFE'; end if;
end $$;
