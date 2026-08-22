-- Durable prepare/delete/finalize protocol for private PRO credential evidence.
begin;

create table public.pro_credential_evidence_removals (
  id uuid primary key default gen_random_uuid(),
  pro_profile_id uuid not null references public.profiles(id) on delete restrict,
  credential_id uuid not null references public.pro_credentials(id) on delete restrict,
  evidence_id uuid not null unique,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  expected_version bigint not null check (expected_version >= 0),
  operation_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  storage_path text,
  status text not null default 'prepared' check (status in ('prepared', 'complete')),
  sanitized_result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint pro_credential_evidence_removals_operation unique (credential_id, operation_id),
  constraint pro_credential_evidence_removals_shape check (
    (status = 'prepared' and storage_path is not null and sanitized_result is null and completed_at is null)
    or
    (status = 'complete' and storage_path is null and sanitized_result is not null and completed_at is not null)
  )
);
create unique index pro_credential_evidence_removals_one_prepared_credential
  on public.pro_credential_evidence_removals(credential_id) where status = 'prepared';

alter table public.pro_credential_evidence_removals disable row level security;
revoke all on table public.pro_credential_evidence_removals
  from public, anon, authenticated, service_role;

create or replace function public.guard_pro_credential_evidence_removal_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
  end if;
  if current_setting('app.pro_evidence_finalize', true) is distinct from old.id::text
     or old.status <> 'prepared' or new.status <> 'complete'
     or row(new.pro_profile_id, new.credential_id, new.evidence_id, new.actor_id,
            new.expected_version, new.operation_id, new.payload_hash, new.created_at)
        is distinct from
        row(old.pro_profile_id, old.credential_id, old.evidence_id, old.actor_id,
            old.expected_version, old.operation_id, old.payload_hash, old.created_at)
     or new.storage_path is not null or new.sanitized_result is null or new.completed_at is null then
    raise exception using errcode = 'P0001', message = 'REMOVAL_RESERVATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger pro_credential_evidence_removals_immutable
  before update or delete on public.pro_credential_evidence_removals
  for each row execute function public.guard_pro_credential_evidence_removal_reservation();

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
     and current_setting('app.pro_evidence_finalize', true) is distinct from v_reservation_id::text then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
  end if;
  return new;
end;
$$;

create trigger pro_credentials_guard_prepared_evidence_removal
  before update on public.pro_credentials
  for each row execute function public.guard_prepared_pro_evidence_removal();

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
      and current_setting('app.pro_evidence_finalize', true) = removal.id::text
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_NOT_PREPARED';
  end if;
  return old;
end;
$$;

create trigger pro_credential_evidence_guard_delete
  before delete on public.pro_credential_evidence
  for each row execute function public.guard_pro_evidence_delete();

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

alter table public.pro_credential_evidence_removals owner to postgres;
alter function public.guard_pro_credential_evidence_removal_reservation() owner to postgres;
alter function public.guard_prepared_pro_evidence_removal() owner to postgres;
alter function public.guard_pro_evidence_delete() owner to postgres;
alter function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;
alter function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  owner to postgres;

revoke all on function public.guard_pro_credential_evidence_removal_reservation()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_prepared_pro_evidence_removal()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_pro_evidence_delete()
  from public, anon, authenticated, service_role;
revoke all on function public.remove_pro_credential_evidence(uuid, uuid, uuid, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  to service_role;
grant execute on function public.finalize_pro_credential_evidence_removal(uuid, uuid, uuid, bigint, uuid, text)
  to service_role;

commit;
