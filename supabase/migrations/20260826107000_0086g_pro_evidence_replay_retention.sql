begin;

create or replace function public.prepare_pro_credential_evidence_upload(
  p_actor_id uuid, p_credential_id uuid, p_expected_version bigint,
  p_operation_id uuid, p_payload_hash text, p_evidence_id uuid, p_storage_path text,
  p_mime_type text, p_size_bytes bigint, p_sha256 text, p_original_name_safe text,
  p_scan_provider text, p_scan_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_terminal public.pro_credential_evidence_upload_reservations%rowtype;
  v_replay jsonb;
begin
  select * into v_credential
  from public.pro_credentials
  where id = p_credential_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  begin
    perform public.assert_pro_lifecycle_actor(
      p_actor_id, v_credential.pro_profile_id, false
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;

  select * into v_terminal
  from public.pro_credential_evidence_upload_reservations
  where credential_id = p_credential_id
    and operation_id = p_operation_id
    and status = 'finalized';
  if found then
    if row(
      v_terminal.actor_id, v_terminal.expected_version, v_terminal.payload_hash,
      v_terminal.evidence_id, v_terminal.storage_path, v_terminal.mime_type,
      v_terminal.size_bytes, v_terminal.sha256, v_terminal.original_name_safe
    ) is distinct from row(
      p_actor_id, p_expected_version, p_payload_hash, p_evidence_id,
      p_storage_path, p_mime_type, p_size_bytes, p_sha256,
      pg_catalog.btrim(p_original_name_safe)
    ) then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    v_replay := public.pro_lifecycle_replay_result(
      'credential', p_credential_id, p_operation_id, p_payload_hash
    );
    if v_replay is null then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_LOST';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'complete', 'credential', v_replay
    );
  end if;

  if exists (
    select 1 from public.pro_credential_evidence_removals
    where credential_id = p_credential_id and status in ('prepared', 'recovering')
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
  end if;
  return private.prepare_pro_credential_evidence_upload_0086d(
    p_actor_id, p_credential_id, p_expected_version, p_operation_id, p_payload_hash,
    p_evidence_id, p_storage_path, p_mime_type, p_size_bytes, p_sha256,
    p_original_name_safe, p_scan_provider, p_scan_completed_at
  );
end;
$$;

create or replace function public.guard_pro_credential_evidence_removal_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_same_identity boolean;
begin
  if tg_op = 'DELETE' then
    if current_setting('app.pro_evidence_cleanup', true) = 'terminal'
       and old.status in ('complete', 'cancelled') then
      return old;
    end if;
    raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
  end if;

  v_same_identity := row(new.pro_profile_id, new.credential_id, new.evidence_id, new.actor_id,
                         new.expected_version, new.operation_id, new.payload_hash, new.created_at)
    is not distinct from
    row(old.pro_profile_id, old.credential_id, old.evidence_id, old.actor_id,
        old.expected_version, old.operation_id, old.payload_hash, old.created_at);
  if not v_same_identity then
    raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
  end if;

  if current_setting('app.pro_evidence_finalize', true) = old.id::text
     and old.status = 'prepared' and new.status = 'complete'
     and new.recovery_actor_id is null and new.recovery_operation_id is null then
    return new;
  end if;
  if current_setting('app.pro_evidence_recovery_claim', true) = old.id::text
     and old.status in ('prepared', 'recovering', 'cancelled') and new.status = 'recovering'
     and new.recovery_actor_id is not null and new.recovery_operation_id is not null then
    return new;
  end if;
  if current_setting('app.pro_evidence_recovery_finalize', true) = old.id::text
     and old.status = 'recovering' and new.status = 'complete'
     and new.recovery_actor_id is not null and new.recovery_operation_id is null then
    return new;
  end if;
  if current_setting('app.pro_evidence_resume', true) = old.id::text
     and new.status = 'prepared' and new.recovery_actor_id is null
     and new.recovery_operation_id is null
     and ((old.status = 'prepared' and new.storage_path = old.storage_path)
          or old.status = 'cancelled') then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
end;
$$;

create or replace function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count bigint := 0;
begin
  for v_id in
    select reservation.id
    from public.pro_credential_evidence_upload_reservations reservation
    where reservation.status in ('finalized', 'cleaned')
      and reservation.finalized_at < pg_catalog.now() - interval '91 days'
    order by reservation.finalized_at, reservation.id
    limit 1000
    for update skip locked
  loop
    perform pg_catalog.set_config('app.pro_evidence_upload_retention', v_id::text, true);
    delete from public.pro_credential_evidence_upload_reservations where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cleanup_pro_credential_evidence_removals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_deleted integer := 0;
begin
  for v_id in
    select removal.id
    from public.pro_credential_evidence_removals removal
    where (removal.status = 'complete'
           and removal.completed_at < pg_catalog.now() - interval '91 days')
       or (removal.status = 'cancelled'
           and removal.cancelled_at < pg_catalog.now() - interval '91 days')
    order by coalesce(removal.completed_at, removal.cancelled_at), removal.id
    limit 1000
    for update skip locked
  loop
    perform pg_catalog.set_config('app.pro_evidence_cleanup', 'terminal', true);
    delete from public.pro_credential_evidence_removals where id = v_id;
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end;
$$;

alter function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) owner to postgres;
alter function public.guard_pro_credential_evidence_removal_reservation() owner to postgres;
alter function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
  owner to postgres;
alter function public.cleanup_pro_credential_evidence_removals() owner to postgres;

revoke all on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.guard_pro_credential_evidence_removal_reservation()
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_pro_credential_evidence_removals()
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.cleanup_pro_credential_evidence_removals()
  to service_role;

do $$ begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'pro-evidence-upload-tombstone-retention';
exception when others then null; end $$;
select cron.schedule(
  'pro-evidence-upload-tombstone-retention', '25 3 * * *',
  $cron$select public.cleanup_finalized_pro_credential_evidence_upload_reservations()$cron$
);

do $$ begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'pro-evidence-removal-retention-cleanup';
exception when others then null; end $$;
select cron.schedule(
  'pro-evidence-removal-retention-cleanup', '15 3 * * *',
  $cron$select public.cleanup_pro_credential_evidence_removals()$cron$
);

commit;
