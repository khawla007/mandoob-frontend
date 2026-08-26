\set ON_ERROR_STOP on
set statement_timeout = '20s';
do $$ declare v_attempt integer; begin
  for v_attempt in 1..100 loop
    if exists (select 1 from pg_catalog.pg_locks where locktype = 'advisory'
      and classid = 69007 and objid = 1 and granted) then return; end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  raise exception 'UPLOAD_PREPARE_NOT_READY';
end $$;
do $$ begin
  perform public.prepare_pro_credential_evidence_removal(
    '95200000-0000-4000-8000-000000000001', '95200000-0000-4000-8000-000000000010',
    '95200000-0000-4000-8000-000000000011', 0,
    '95200000-0000-4000-8000-000000000013', repeat('2', 64)
  );
  raise exception 'REMOVAL_PREPARED_ALONGSIDE_UPLOAD';
exception when others then
  if sqlerrm <> 'EVIDENCE_UPLOAD_IN_PROGRESS' then raise; end if;
end $$;
do $$ begin
  if not exists (select 1 from public.pro_credential_evidence_upload_reservations
      where credential_id = '95200000-0000-4000-8000-000000000010'
        and status = 'prepared' and lease_expires_at > now())
     or exists (select 1 from public.pro_credential_evidence_removals
      where credential_id = '95200000-0000-4000-8000-000000000010'
        and status in ('prepared', 'recovering')) then
    raise exception 'UPLOAD_FIRST_MUTEX_STATE_INVALID';
  end if;
end $$;
