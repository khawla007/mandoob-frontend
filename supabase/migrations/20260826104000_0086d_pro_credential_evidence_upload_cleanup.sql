begin;

alter table public.pro_credential_evidence_upload_reservations
  add column recovery_operation_id uuid,
  add column recovery_lease_expires_at timestamptz;

alter table public.pro_credential_evidence_upload_reservations
  drop constraint pro_credential_evidence_upload_reservations_status_check,
  drop constraint pro_credential_evidence_upload_reservations_shape,
  add constraint pro_credential_evidence_upload_reservations_status_check
    check (status in ('prepared', 'cleanup', 'recovering', 'finalized')),
  add constraint pro_credential_evidence_upload_reservations_shape check (
    (status = 'prepared' and lease_expires_at is not null and cleanup_after is null
      and finalized_at is null and recovery_operation_id is null
      and recovery_lease_expires_at is null)
    or (status = 'cleanup' and lease_expires_at is null and cleanup_after is not null
      and finalized_at is null and recovery_operation_id is null
      and recovery_lease_expires_at is null)
    or (status = 'recovering' and lease_expires_at is null and cleanup_after is not null
      and finalized_at is null and recovery_operation_id is not null
      and recovery_lease_expires_at is not null)
    or (status = 'finalized' and lease_expires_at is null and cleanup_after is null
      and finalized_at is not null and recovery_operation_id is null
      and recovery_lease_expires_at is null)
  );

create or replace function public.guard_pro_credential_evidence_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not (
      (old.status = 'recovering'
        and current_setting('app.pro_evidence_upload_cleanup_finalize', true)
          = old.recovery_operation_id::text)
      or (old.status = 'finalized'
        and current_setting('app.pro_evidence_upload_retention', true) = old.id::text)
    ) then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_IMMUTABLE';
    end if;
    return old;
  end if;
  if row(
    new.pro_profile_id, new.credential_id, new.actor_id, new.expected_version,
    new.operation_id, new.payload_hash, new.evidence_id, new.storage_path,
    new.mime_type, new.size_bytes, new.sha256, new.original_name_safe,
    new.scan_provider, new.scan_completed_at, new.created_at
  ) is distinct from row(
    old.pro_profile_id, old.credential_id, old.actor_id, old.expected_version,
    old.operation_id, old.payload_hash, old.evidence_id, old.storage_path,
    old.mime_type, old.size_bytes, old.sha256, old.original_name_safe,
    old.scan_provider, old.scan_completed_at, old.created_at
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_IMMUTABLE';
  end if;
  if old.status = 'prepared' and new.status = 'prepared' then
    null;
  elsif old.status = 'prepared' and new.status = 'cleanup' then
    null;
  elsif old.status = 'prepared' and new.status = 'finalized'
      and current_setting('app.pro_evidence_upload_finalize', true) = old.id::text then
    null;
  elsif old.status in ('prepared', 'cleanup', 'recovering') and new.status = 'recovering'
      and current_setting('app.pro_evidence_upload_cleanup_claim', true)
        = new.recovery_operation_id::text then
    null;
  elsif old.status = 'recovering' and new.status = 'finalized'
      and current_setting('app.pro_evidence_upload_cleanup_finalize', true)
        = old.recovery_operation_id::text then
    null;
  else
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_INVALID';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop function public.cleanup_pro_credential_evidence_upload_reservations();

create or replace function public.claim_pro_credential_evidence_upload_cleanup(
  p_recovery_operation_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_recovery_operation_id is null or p_limit not between 1 and 25 then
    raise exception using errcode = 'P0001', message = 'INVALID_CLEANUP_CLAIM';
  end if;
  perform pg_catalog.set_config(
    'app.pro_evidence_upload_cleanup_claim', p_recovery_operation_id::text, true
  );
  with candidates as (
    select reservation.id
    from public.pro_credential_evidence_upload_reservations reservation
    where (
      (reservation.status = 'cleanup'
        and reservation.cleanup_after <= pg_catalog.now())
      or (reservation.status = 'prepared'
        and reservation.lease_expires_at <= pg_catalog.now())
      or (reservation.status = 'recovering'
        and reservation.recovery_lease_expires_at <= pg_catalog.now())
    )
      and not exists (
        select 1 from public.pro_credential_evidence evidence
        where evidence.storage_path = reservation.storage_path
      )
    order by reservation.created_at, reservation.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.pro_credential_evidence_upload_reservations reservation
    set status = 'recovering', lease_expires_at = null,
        cleanup_after = coalesce(reservation.cleanup_after, pg_catalog.now() + interval '7 days'),
        recovery_operation_id = p_recovery_operation_id,
        recovery_lease_expires_at = pg_catalog.now() + interval '10 minutes'
    from candidates
    where reservation.id = candidates.id
    returning reservation.*
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'reservationId', claimed.id,
    'recoveryOperationId', claimed.recovery_operation_id,
    'proProfileId', claimed.pro_profile_id,
    'credentialId', claimed.credential_id,
    'evidenceId', claimed.evidence_id,
    'storagePath', claimed.storage_path
  ) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into v_result
  from claimed;
  return v_result;
end;
$$;

create or replace function public.finalize_pro_credential_evidence_upload_cleanup(
  p_reservation_id uuid,
  p_recovery_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.pro_credential_evidence_upload_reservations%rowtype;
begin
  select * into v_reservation
  from public.pro_credential_evidence_upload_reservations
  where id = p_reservation_id
  for update;
  if not found or v_reservation.status <> 'recovering'
     or v_reservation.recovery_operation_id <> p_recovery_operation_id
     or v_reservation.recovery_lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_CLEANUP_CLAIM_LOST';
  end if;
  perform pg_catalog.set_config(
    'app.pro_evidence_upload_cleanup_finalize', p_recovery_operation_id::text, true
  );
  if exists (
    select 1 from public.pro_credential_evidence evidence
    where evidence.storage_path = v_reservation.storage_path
  ) then
    update public.pro_credential_evidence_upload_reservations
    set status = 'finalized', cleanup_after = null,
        recovery_operation_id = null, recovery_lease_expires_at = null,
        finalized_at = coalesce(finalized_at, pg_catalog.now())
    where id = p_reservation_id;
    return pg_catalog.jsonb_build_object('status', 'referenced');
  end if;
  delete from public.pro_credential_evidence_upload_reservations
  where id = p_reservation_id;
  return pg_catalog.jsonb_build_object('status', 'cleaned');
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
    where reservation.status = 'finalized'
      and reservation.finalized_at < pg_catalog.now() - interval '30 days'
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

alter function public.guard_pro_credential_evidence_upload_reservation() owner to postgres;
alter function public.claim_pro_credential_evidence_upload_cleanup(uuid, integer) owner to postgres;
alter function public.finalize_pro_credential_evidence_upload_cleanup(uuid, uuid) owner to postgres;
alter function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
  owner to postgres;

revoke all on function public.register_pro_credential_evidence(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from service_role;
revoke all on function public.claim_pro_credential_evidence_upload_cleanup(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_pro_credential_evidence_upload_cleanup(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_pro_credential_evidence_upload_cleanup(uuid, integer)
  to service_role;
grant execute on function public.finalize_pro_credential_evidence_upload_cleanup(uuid, uuid)
  to service_role;

do $$ begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'pro-evidence-upload-tombstone-retention';
exception when others then null; end $$;
select cron.schedule(
  'pro-evidence-upload-tombstone-retention', '25 3 * * *',
  $cron$select public.cleanup_finalized_pro_credential_evidence_upload_reservations()$cron$
);

commit;
