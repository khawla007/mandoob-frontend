-- Bounded lease recovery and terminal retention for evidence-removal reservations.
begin;

alter table public.pro_credential_evidence_removals
  add column lease_expires_at timestamptz,
  add column cancelled_at timestamptz,
  add column recovery_actor_id uuid references public.profiles(id) on delete restrict;

update public.pro_credential_evidence_removals
set lease_expires_at = created_at + interval '15 minutes'
where lease_expires_at is null;

alter table public.pro_credential_evidence_removals
  alter column lease_expires_at set default (pg_catalog.now() + interval '15 minutes'),
  alter column lease_expires_at set not null,
  drop constraint pro_credential_evidence_removals_status_check,
  drop constraint pro_credential_evidence_removals_shape,
  add constraint pro_credential_evidence_removals_status_check
    check (status in ('prepared', 'complete', 'cancelled')),
  add constraint pro_credential_evidence_removals_shape check (
    (status = 'prepared' and storage_path is not null and sanitized_result is null
      and completed_at is null and cancelled_at is null and recovery_actor_id is null)
    or
    (status = 'complete' and storage_path is null and sanitized_result is not null
      and completed_at is not null and cancelled_at is null)
    or
    (status = 'cancelled' and storage_path is null and sanitized_result is null
      and completed_at is null and cancelled_at is not null and recovery_actor_id is not null)
  );

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
     and new.recovery_actor_id is null then
    return new;
  end if;
  if current_setting('app.pro_evidence_recovery', true) = old.id::text
     and old.status = 'prepared' and new.status in ('complete', 'cancelled')
     and new.recovery_actor_id is not null then
    return new;
  end if;
  if current_setting('app.pro_evidence_resume', true) = old.id::text
     and new.status = 'prepared' and new.recovery_actor_id is null
     and (
       (old.status = 'prepared' and new.storage_path = old.storage_path)
       or old.status = 'cancelled'
     ) then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
end;
$$;

create or replace function public.guard_prepared_pro_evidence_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
begin
  select removal.id into v_reservation_id
  from public.pro_credential_evidence_removals removal
  where removal.credential_id = old.id and removal.status = 'prepared';
  if v_reservation_id is not null
     and current_setting('app.pro_evidence_finalize', true) is distinct from v_reservation_id::text
     and current_setting('app.pro_evidence_recovery', true) is distinct from v_reservation_id::text then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
  end if;
  return new;
end;
$$;

create or replace function public.guard_pro_evidence_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pro_credential_evidence_removals removal
    where removal.evidence_id = old.id and removal.status = 'prepared'
      and (
        current_setting('app.pro_evidence_finalize', true) = removal.id::text
        or current_setting('app.pro_evidence_recovery', true) = removal.id::text
      )
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_NOT_PREPARED';
  end if;
  return old;
end;
$$;

create or replace function public.prepare_pro_credential_evidence_removal(
  p_actor_id uuid,
  p_credential_id uuid,
  p_evidence_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_evidence public.pro_credential_evidence%rowtype;
  v_removal public.pro_credential_evidence_removals%rowtype;
  v_replay jsonb;
  v_pro_profile_id uuid;
begin
  if p_operation_id is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_OPERATION';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_evidence_id::text, 71));
  select * into v_removal from public.pro_credential_evidence_removals
  where evidence_id = p_evidence_id for update;
  if found then
    begin
      perform public.authorize_pro_lifecycle_actor(p_actor_id, v_removal.pro_profile_id, false);
    exception when sqlstate 'P0001' then
      if sqlerrm = 'FORBIDDEN' then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;
      raise;
    end;
    if v_removal.actor_id <> p_actor_id or v_removal.operation_id <> p_operation_id then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
    end if;
    if v_removal.credential_id <> p_credential_id
       or v_removal.expected_version <> p_expected_version
       or v_removal.payload_hash <> p_payload_hash then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    if v_removal.status = 'complete' then
      return pg_catalog.jsonb_build_object('status', 'complete', 'credential', v_removal.sanitized_result);
    end if;

    if v_removal.status = 'cancelled' then
      select * into v_credential from public.pro_credentials
      where id = v_removal.credential_id and pro_profile_id = v_removal.pro_profile_id for update;
      if not found or v_credential.version <> v_removal.expected_version
         or v_credential.state <> 'draft' then
        raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
      end if;
      select * into v_evidence from public.pro_credential_evidence
      where id = v_removal.evidence_id
        and credential_id = v_removal.credential_id
        and pro_profile_id = v_removal.pro_profile_id for update;
      if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
      perform pg_catalog.set_config('app.pro_evidence_resume', v_removal.id::text, true);
      update public.pro_credential_evidence_removals
      set status = 'prepared', storage_path = v_evidence.storage_path,
          lease_expires_at = pg_catalog.now() + interval '15 minutes',
          cancelled_at = null, recovery_actor_id = null
      where id = v_removal.id returning * into v_removal;
    else
      perform pg_catalog.set_config('app.pro_evidence_resume', v_removal.id::text, true);
      update public.pro_credential_evidence_removals
      set lease_expires_at = pg_catalog.now() + interval '15 minutes'
      where id = v_removal.id returning * into v_removal;
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'prepared', 'credentialId', v_removal.credential_id,
      'evidenceId', v_removal.evidence_id, 'storagePath', v_removal.storage_path
    );
  end if;

  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
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
  select * into v_evidence from public.pro_credential_evidence
  where id = p_evidence_id and credential_id = p_credential_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if exists (
    select 1 from public.pro_credential_evidence_removals
    where credential_id = p_credential_id and status = 'prepared'
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
  end if;
  insert into public.pro_credential_evidence_removals (
    pro_profile_id, credential_id, evidence_id, actor_id, expected_version,
    operation_id, payload_hash, storage_path
  ) values (
    v_evidence.pro_profile_id, p_credential_id, p_evidence_id, p_actor_id,
    p_expected_version, p_operation_id, p_payload_hash, v_evidence.storage_path
  ) returning * into v_removal;
  return pg_catalog.jsonb_build_object(
    'status', 'prepared', 'credentialId', v_removal.credential_id,
    'evidenceId', v_removal.evidence_id, 'storagePath', v_removal.storage_path
  );
end;
$$;

create or replace function public.finalize_pro_credential_evidence_removal(
  p_actor_id uuid,
  p_credential_id uuid,
  p_evidence_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_removal public.pro_credential_evidence_removals%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_evidence_id::text, 71));
  select * into v_removal from public.pro_credential_evidence_removals
  where evidence_id = p_evidence_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  begin
    perform public.assert_pro_lifecycle_actor(p_actor_id, v_removal.pro_profile_id, false);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;
  if v_removal.actor_id <> p_actor_id or v_removal.operation_id <> p_operation_id
     or v_removal.credential_id <> p_credential_id
     or v_removal.expected_version <> p_expected_version
     or v_removal.payload_hash <> p_payload_hash then
    raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
  end if;
  if v_removal.status = 'complete' then return v_removal.sanitized_result; end if;
  if v_removal.status <> 'prepared' then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_NOT_PREPARED';
  end if;

  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  if v_credential.version <> p_expected_version or v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  perform pg_catalog.set_config('app.pro_evidence_finalize', v_removal.id::text, true);
  delete from public.pro_credential_evidence
  where id = p_evidence_id and credential_id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  update public.pro_credentials set version = version + 1 where id = p_credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_removal.pro_profile_id, 'credential_evidence_removed',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  update public.pro_credential_evidence_removals
  set status = 'complete', storage_path = null, sanitized_result = v_result,
      completed_at = pg_catalog.now()
  where id = v_removal.id;
  return v_result;
end;
$$;

create or replace function public.recover_pro_credential_evidence_removal(
  p_actor_id uuid,
  p_evidence_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_credential public.pro_credentials%rowtype;
  v_evidence public.pro_credential_evidence%rowtype;
  v_removal public.pro_credential_evidence_removals%rowtype;
  v_object_exists boolean;
  v_result jsonb;
begin
  -- Reject non-operators before looking up a reservation, then lock/revalidate in
  -- the same advisory-first order used by prepare/finalize to avoid lock inversion.
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or v_actor.role not in ('admin', 'super_admin')
     or v_actor.status <> 'active' or v_actor.tenant_id is not null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_evidence_id::text, 71));
  select * into v_actor from public.profiles where id = p_actor_id for update;
  if not found or v_actor.role not in ('admin', 'super_admin')
     or v_actor.status <> 'active' or v_actor.tenant_id is not null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  select * into v_removal from public.pro_credential_evidence_removals
  where evidence_id = p_evidence_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_removal.status = 'complete' then
    return pg_catalog.jsonb_build_object('status', 'complete', 'credential', v_removal.sanitized_result);
  end if;
  if v_removal.status = 'cancelled' then
    return pg_catalog.jsonb_build_object('status', 'cancelled');
  end if;
  if v_removal.lease_expires_at > pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_LEASE_ACTIVE';
  end if;

  select * into v_credential from public.pro_credentials
  where id = v_removal.credential_id and pro_profile_id = v_removal.pro_profile_id for update;
  if not found or v_credential.version <> v_removal.expected_version
     or v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'RECOVERY_STATE_CHANGED';
  end if;
  select * into v_evidence from public.pro_credential_evidence
  where id = v_removal.evidence_id
    and credential_id = v_removal.credential_id
    and pro_profile_id = v_removal.pro_profile_id
    and storage_path = v_removal.storage_path for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RECOVERY_STATE_CHANGED';
  end if;

  select exists (
    select 1 from storage.objects
    where bucket_id = 'tenant-documents' and name = v_removal.storage_path
  ) into v_object_exists;
  perform pg_catalog.set_config('app.pro_evidence_recovery', v_removal.id::text, true);
  if v_object_exists then
    update public.pro_credential_evidence_removals
    set status = 'cancelled', storage_path = null, cancelled_at = pg_catalog.now(),
        recovery_actor_id = p_actor_id
    where id = v_removal.id;
    perform public.write_pro_lifecycle_audit(
      p_actor_id, v_removal.pro_profile_id, 'credential_evidence_removal_cancelled',
      v_removal.credential_id, v_credential.version
    );
    return pg_catalog.jsonb_build_object('status', 'cancelled');
  end if;

  delete from public.pro_credential_evidence
  where id = v_removal.evidence_id and credential_id = v_removal.credential_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RECOVERY_STATE_CHANGED';
  end if;
  update public.pro_credentials set version = version + 1 where id = v_removal.credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_removal.pro_profile_id, 'credential_evidence_removal_recovered',
    v_removal.credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(v_removal.credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', v_removal.credential_id, v_removal.operation_id,
    v_removal.payload_hash, v_result
  );
  update public.pro_credential_evidence_removals
  set status = 'complete', storage_path = null, sanitized_result = v_result,
      completed_at = pg_catalog.now(), recovery_actor_id = p_actor_id
  where id = v_removal.id;
  return pg_catalog.jsonb_build_object('status', 'complete', 'credential', v_result);
end;
$$;

create or replace function public.cleanup_pro_credential_evidence_removals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform pg_catalog.set_config('app.pro_evidence_cleanup', 'terminal', true);
  delete from public.pro_credential_evidence_removals
  where status in ('complete', 'cancelled')
    and coalesce(completed_at, cancelled_at) < pg_catalog.now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter function public.guard_pro_credential_evidence_removal_reservation() owner to postgres;
alter function public.guard_prepared_pro_evidence_removal() owner to postgres;
alter function public.guard_pro_evidence_delete() owner to postgres;
alter function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;
alter function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;
alter function public.recover_pro_credential_evidence_removal(uuid, uuid) owner to postgres;
alter function public.cleanup_pro_credential_evidence_removals() owner to postgres;

revoke all on table public.pro_credential_evidence_removals
  from public, anon, authenticated, service_role;
revoke all on function public.guard_pro_credential_evidence_removal_reservation()
  from public, anon, authenticated, service_role;
revoke all on function public.recover_pro_credential_evidence_removal(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_pro_credential_evidence_removals()
  from public, anon, authenticated, service_role;
grant execute on function public.recover_pro_credential_evidence_removal(uuid, uuid)
  to service_role;
grant execute on function public.cleanup_pro_credential_evidence_removals()
  to service_role;

do $$ begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'pro-evidence-removal-retention-cleanup';
exception when others then null; end $$;
select cron.schedule(
  'pro-evidence-removal-retention-cleanup', '15 3 * * *',
  $cron$select public.cleanup_pro_credential_evidence_removals()$cron$
);

commit;
