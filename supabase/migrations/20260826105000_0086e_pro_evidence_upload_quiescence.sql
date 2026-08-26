begin;

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated, service_role;

alter function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) set schema private;
alter function private.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) rename to prepare_pro_credential_evidence_upload_0086d;

alter function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  set schema private;
alter function private.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  rename to prepare_pro_credential_evidence_removal_0086d;
alter function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  set schema private;
alter function private.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  rename to finalize_pro_credential_evidence_removal_0086d;
alter function public.claim_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  set schema private;
alter function private.claim_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  rename to claim_pro_credential_evidence_removal_recovery_0086d;
alter function public.finalize_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  set schema private;
alter function private.finalize_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  rename to finalize_pro_credential_evidence_removal_recovery_0086d;

revoke all on function private.prepare_pro_credential_evidence_upload_0086d(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.prepare_pro_credential_evidence_removal_0086d(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function private.finalize_pro_credential_evidence_removal_0086d(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function private.claim_pro_credential_evidence_removal_recovery_0086d(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.finalize_pro_credential_evidence_removal_recovery_0086d(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

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
begin
  perform 1 from public.pro_credentials
  where id = p_credential_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
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

create or replace function public.prepare_pro_credential_evidence_removal(
  p_actor_id uuid, p_credential_id uuid, p_evidence_id uuid,
  p_expected_version bigint, p_operation_id uuid, p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.pro_credentials
  where id = p_credential_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if exists (
    select 1 from public.pro_credential_evidence_upload_reservations
    where credential_id = p_credential_id and status in ('prepared', 'recovering')
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_IN_PROGRESS';
  end if;
  return private.prepare_pro_credential_evidence_removal_0086d(
    p_actor_id, p_credential_id, p_evidence_id, p_expected_version,
    p_operation_id, p_payload_hash
  );
end;
$$;

create or replace function public.finalize_pro_credential_evidence_removal(
  p_actor_id uuid, p_credential_id uuid, p_evidence_id uuid,
  p_expected_version bigint, p_operation_id uuid, p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.pro_credentials where id = p_credential_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  return private.finalize_pro_credential_evidence_removal_0086d(
    p_actor_id, p_credential_id, p_evidence_id, p_expected_version,
    p_operation_id, p_payload_hash
  );
end;
$$;

create or replace function public.claim_pro_credential_evidence_removal_recovery(
  p_actor_id uuid, p_pro_profile_id uuid, p_credential_id uuid,
  p_evidence_id uuid, p_recovery_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.pro_credentials
  where id = p_credential_id and pro_profile_id = p_pro_profile_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  return private.claim_pro_credential_evidence_removal_recovery_0086d(
    p_actor_id, p_pro_profile_id, p_credential_id, p_evidence_id,
    p_recovery_operation_id
  );
end;
$$;

create or replace function public.finalize_pro_credential_evidence_removal_recovery(
  p_actor_id uuid, p_pro_profile_id uuid, p_credential_id uuid,
  p_evidence_id uuid, p_recovery_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.pro_credentials
  where id = p_credential_id and pro_profile_id = p_pro_profile_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  return private.finalize_pro_credential_evidence_removal_recovery_0086d(
    p_actor_id, p_pro_profile_id, p_credential_id, p_evidence_id,
    p_recovery_operation_id
  );
end;
$$;

alter table public.pro_credential_evidence_upload_reservations
  add column cleanup_passes integer not null default 0
    check (cleanup_passes between 0 and 2);

alter table public.pro_credential_evidence_upload_reservations
  drop constraint pro_credential_evidence_upload_reservations_status_check,
  drop constraint pro_credential_evidence_upload_reservations_shape,
  add constraint pro_credential_evidence_upload_reservations_status_check
    check (status in ('prepared', 'cleanup', 'recovering', 'finalized', 'cleaned')),
  add constraint pro_credential_evidence_upload_reservations_shape check (
    (status = 'prepared' and lease_expires_at is not null and cleanup_after is null
      and finalized_at is null and recovery_operation_id is null
      and recovery_lease_expires_at is null and cleanup_passes = 0)
    or (status = 'cleanup' and lease_expires_at is null and cleanup_after is not null
      and finalized_at is null and recovery_operation_id is null
      and recovery_lease_expires_at is null and cleanup_passes in (0, 1))
    or (status = 'recovering' and lease_expires_at is null and cleanup_after is not null
      and finalized_at is null and recovery_operation_id is not null
      and recovery_lease_expires_at is not null and cleanup_passes in (0, 1))
    or (status = 'finalized' and lease_expires_at is null and cleanup_after is null
      and finalized_at is not null and recovery_operation_id is null
      and recovery_lease_expires_at is null and cleanup_passes in (0, 1))
    or (status = 'cleaned' and lease_expires_at is null and cleanup_after is null
      and finalized_at is not null and recovery_operation_id is null
      and recovery_lease_expires_at is null and cleanup_passes = 2)
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
      old.status in ('finalized', 'cleaned')
      and current_setting('app.pro_evidence_upload_retention', true) = old.id::text
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
  if old.status = 'prepared' and new.status = 'prepared'
      and new.cleanup_passes = old.cleanup_passes then
    null;
  elsif old.status = 'prepared' and new.status = 'cleanup'
      and new.cleanup_passes = old.cleanup_passes then
    null;
  elsif old.status = 'prepared' and new.status = 'finalized'
      and new.cleanup_passes = old.cleanup_passes
      and current_setting('app.pro_evidence_upload_finalize', true) = old.id::text then
    null;
  elsif old.status in ('prepared', 'cleanup', 'recovering') and new.status = 'recovering'
      and new.cleanup_passes = old.cleanup_passes
      and current_setting('app.pro_evidence_upload_cleanup_claim', true)
        = new.recovery_operation_id::text then
    null;
  elsif old.status = 'recovering' and new.status = 'cleanup'
      and old.cleanup_passes = 0 and new.cleanup_passes = 1
      and current_setting('app.pro_evidence_upload_cleanup_finalize', true)
        = old.recovery_operation_id::text then
    null;
  elsif old.status = 'recovering' and new.status = 'cleaned'
      and old.cleanup_passes = 1 and new.cleanup_passes = 2
      and current_setting('app.pro_evidence_upload_cleanup_finalize', true)
        = old.recovery_operation_id::text then
    null;
  elsif old.status = 'recovering' and new.status = 'finalized'
      and new.cleanup_passes = old.cleanup_passes
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

create or replace function public.finalize_pro_credential_evidence_upload_cleanup(
  p_reservation_id uuid, p_recovery_operation_id uuid
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
  if v_reservation.cleanup_passes = 0 then
    update public.pro_credential_evidence_upload_reservations
    set status = 'cleanup', cleanup_passes = 1,
        cleanup_after = pg_catalog.now() + interval '5 minutes',
        recovery_operation_id = null, recovery_lease_expires_at = null
    where id = p_reservation_id;
    return pg_catalog.jsonb_build_object('status', 'quiescing');
  end if;
  update public.pro_credential_evidence_upload_reservations
  set status = 'cleaned', cleanup_passes = 2, cleanup_after = null,
      recovery_operation_id = null, recovery_lease_expires_at = null,
      finalized_at = pg_catalog.now()
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
    where reservation.status in ('finalized', 'cleaned')
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

alter function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) owner to postgres;
alter function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;
alter function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;
alter function public.claim_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  owner to postgres;
alter function public.finalize_pro_credential_evidence_removal_recovery(uuid, uuid, uuid, uuid, uuid)
  owner to postgres;
alter function public.guard_pro_credential_evidence_upload_reservation() owner to postgres;
alter function public.finalize_pro_credential_evidence_upload_cleanup(uuid, uuid) owner to postgres;
alter function public.cleanup_finalized_pro_credential_evidence_upload_reservations()
  owner to postgres;

revoke all on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_pro_credential_evidence_removal_recovery(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pro_credential_evidence_removal_recovery(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.prepare_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) to service_role;
grant execute on function public.finalize_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) to service_role;
grant execute on function public.claim_pro_credential_evidence_removal_recovery(
  uuid, uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.finalize_pro_credential_evidence_removal_recovery(
  uuid, uuid, uuid, uuid, uuid
) to service_role;

commit;
