begin;

create table public.pro_credential_evidence_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null,
  credential_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  expected_version bigint not null check (expected_version >= 0),
  operation_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  evidence_id uuid not null,
  storage_path text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_name_safe text not null check (
    char_length(original_name_safe) between 1 and 255
    and original_name_safe !~ '[/\\[:cntrl:]]'
  ),
  scan_provider text not null check (char_length(btrim(scan_provider)) between 1 and 80),
  scan_completed_at timestamptz not null,
  status text not null default 'prepared' check (status in ('prepared', 'cleanup', 'finalized')),
  lease_expires_at timestamptz,
  cleanup_after timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credential_evidence_upload_reservations_credential_fk
    foreign key (pro_profile_id, credential_id)
    references public.pro_credentials(pro_profile_id, id) on delete cascade,
  constraint pro_credential_evidence_upload_reservations_operation_unique
    unique (credential_id, operation_id),
  constraint pro_credential_evidence_upload_reservations_shape check (
    (status = 'prepared' and lease_expires_at is not null
      and cleanup_after is null and finalized_at is null)
    or (status = 'cleanup' and lease_expires_at is null
      and cleanup_after is not null and finalized_at is null)
    or (status = 'finalized' and lease_expires_at is null
      and cleanup_after is null and finalized_at is not null)
  )
);

create unique index pro_credential_evidence_upload_one_prepared
  on public.pro_credential_evidence_upload_reservations(credential_id)
  where status = 'prepared';
create index pro_credential_evidence_upload_reservations_cleanup_idx
  on public.pro_credential_evidence_upload_reservations(status, cleanup_after)
  where status = 'cleanup';

create or replace function public.guard_pro_credential_evidence_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  if not (
    (old.status = 'prepared' and new.status in ('prepared', 'cleanup', 'finalized'))
    or (old.status = new.status and old.status in ('cleanup', 'finalized'))
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_INVALID';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger guard_pro_credential_evidence_upload_reservation
before update on public.pro_credential_evidence_upload_reservations
for each row execute function public.guard_pro_credential_evidence_upload_reservation();

create or replace function public.guard_prepared_pro_credential_evidence_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
begin
  select reservation.id into v_reservation_id
  from public.pro_credential_evidence_upload_reservations reservation
  where reservation.credential_id = old.id
    and reservation.status = 'prepared'
    and reservation.lease_expires_at > pg_catalog.now();
  if v_reservation_id is not null
     and current_setting('app.pro_evidence_upload_finalize', true)
       is distinct from v_reservation_id::text then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_IN_PROGRESS';
  end if;
  return new;
end;
$$;

create trigger pro_credentials_guard_prepared_evidence_upload
before update on public.pro_credentials
for each row execute function public.guard_prepared_pro_credential_evidence_upload();

create or replace function public.prepare_pro_credential_evidence_upload(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_evidence_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_original_name_safe text,
  p_scan_provider text,
  p_scan_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_reservation public.pro_credential_evidence_upload_reservations%rowtype;
  v_replay jsonb;
  v_cleanup jsonb;
begin
  select * into v_credential
  from public.pro_credentials
  where id = p_credential_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_credential.pro_profile_id, false);

  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then
    return pg_catalog.jsonb_build_object('status', 'complete', 'credential', v_replay);
  end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  if p_evidence_id <> p_operation_id
     or p_storage_path <> 'pro-credentials/' || v_credential.pro_profile_id::text || '/'
       || p_credential_id::text || '/' || p_evidence_id::text
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
     or p_size_bytes not between 1 and 10485760
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or char_length(pg_catalog.btrim(p_original_name_safe)) not between 1 and 255
     or p_original_name_safe ~ '[/\\[:cntrl:]]'
     or char_length(pg_catalog.btrim(p_scan_provider)) not between 1 and 80
     or p_scan_completed_at is null then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_METADATA_INVALID';
  end if;

  select * into v_reservation
  from public.pro_credential_evidence_upload_reservations
  where credential_id = p_credential_id and operation_id = p_operation_id
  for update;
  if found then
    if v_reservation.payload_hash <> p_payload_hash then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    if v_reservation.status <> 'prepared' then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_LOST';
    end if;
    update public.pro_credential_evidence_upload_reservations
    set lease_expires_at = pg_catalog.now() + interval '15 minutes'
    where id = v_reservation.id;
  else
    select * into v_reservation
    from public.pro_credential_evidence_upload_reservations
    where credential_id = p_credential_id and status = 'prepared'
    for update;
    if found and v_reservation.lease_expires_at > pg_catalog.now() then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_IN_PROGRESS';
    end if;
    if found then
      update public.pro_credential_evidence_upload_reservations
      set status = 'cleanup', lease_expires_at = null,
          cleanup_after = pg_catalog.now() + interval '7 days'
      where id = v_reservation.id;
    end if;
    insert into public.pro_credential_evidence_upload_reservations (
      pro_profile_id, credential_id, actor_id, expected_version, operation_id,
      payload_hash, evidence_id, storage_path, mime_type, size_bytes, sha256,
      original_name_safe, scan_provider, scan_completed_at, lease_expires_at
    ) values (
      v_credential.pro_profile_id, p_credential_id, p_actor_id, p_expected_version,
      p_operation_id, p_payload_hash, p_evidence_id, p_storage_path, p_mime_type,
      p_size_bytes, p_sha256, pg_catalog.btrim(p_original_name_safe),
      pg_catalog.btrim(p_scan_provider), p_scan_completed_at,
      pg_catalog.now() + interval '15 minutes'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'reservationId', cleanup.id,
    'storagePath', cleanup.storage_path
  ) order by cleanup.created_at), '[]'::jsonb)
  into v_cleanup
  from (
    select candidate.id, candidate.storage_path, candidate.created_at
    from public.pro_credential_evidence_upload_reservations candidate
    where candidate.credential_id = p_credential_id
      and candidate.status = 'cleanup'
      and not exists (
        select 1 from public.pro_credential_evidence evidence
        where evidence.storage_path = candidate.storage_path
      )
    order by candidate.created_at
    limit 100
  ) cleanup;

  return pg_catalog.jsonb_build_object(
    'status', 'prepared',
    'credentialId', p_credential_id,
    'evidenceId', p_evidence_id,
    'storagePath', p_storage_path,
    'cleanup', v_cleanup
  );
end;
$$;

create or replace function public.finalize_pro_credential_evidence_upload(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_evidence_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_original_name_safe text,
  p_scan_provider text,
  p_scan_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_reservation public.pro_credential_evidence_upload_reservations%rowtype;
  v_replay jsonb;
  v_result jsonb;
begin
  select * into v_credential
  from public.pro_credentials
  where id = p_credential_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_credential.pro_profile_id, false);

  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_reservation
  from public.pro_credential_evidence_upload_reservations
  where credential_id = p_credential_id and operation_id = p_operation_id
  for update;
  -- Expiry permits a competing prepare to reclaim the row; it does not by itself
  -- invalidate finalization. This prevents delete-vs-reference races with a same-op resume.
  if not found or v_reservation.status <> 'prepared' then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_LOST';
  end if;
  if row(
    v_reservation.expected_version, v_reservation.payload_hash,
    v_reservation.evidence_id, v_reservation.storage_path, v_reservation.mime_type,
    v_reservation.size_bytes, v_reservation.sha256, v_reservation.original_name_safe
  ) is distinct from row(
    p_expected_version, p_payload_hash, p_evidence_id, p_storage_path,
    p_mime_type, p_size_bytes, p_sha256, pg_catalog.btrim(p_original_name_safe)
  ) then
    raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
  end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;

  insert into public.pro_credential_evidence (
    id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, uploaded_by
  ) values (
    v_reservation.evidence_id, v_reservation.pro_profile_id, v_reservation.credential_id,
    v_reservation.storage_path, v_reservation.mime_type, v_reservation.size_bytes,
    v_reservation.sha256, v_reservation.original_name_safe, v_reservation.scan_provider,
    v_reservation.scan_completed_at, v_reservation.actor_id
  );
  perform pg_catalog.set_config(
    'app.pro_evidence_upload_finalize', v_reservation.id::text, true
  );
  update public.pro_credentials
  set version = version + 1
  where id = p_credential_id and version = p_expected_version;
  if not found then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_evidence_added',
    p_credential_id, p_expected_version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  update public.pro_credential_evidence_upload_reservations
  set status = 'finalized', lease_expires_at = null, finalized_at = pg_catalog.now()
  where id = v_reservation.id;
  return v_result;
end;
$$;

create or replace function public.cleanup_pro_credential_evidence_upload_reservations()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  delete from public.pro_credential_evidence_upload_reservations reservation
  where reservation.status = 'cleanup'
    and reservation.cleanup_after <= pg_catalog.now()
    and not exists (
      select 1 from public.pro_credential_evidence evidence
      where evidence.storage_path = reservation.storage_path
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.register_pro_credential_evidence(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from service_role;

alter table public.pro_credential_evidence_upload_reservations owner to postgres;
alter function public.guard_pro_credential_evidence_upload_reservation() owner to postgres;
alter function public.guard_prepared_pro_credential_evidence_upload() owner to postgres;
alter function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) owner to postgres;
alter function public.finalize_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) owner to postgres;
alter function public.cleanup_pro_credential_evidence_upload_reservations() owner to postgres;

revoke all on table public.pro_credential_evidence_upload_reservations
  from public, anon, authenticated, service_role;
revoke all on function public.guard_pro_credential_evidence_upload_reservation()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_prepared_pro_credential_evidence_upload()
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_pro_credential_evidence_upload_reservations()
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.finalize_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) to service_role;

commit;
