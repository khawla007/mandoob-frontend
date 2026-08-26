begin;

-- A term's version is its own OCC revision, not a sequence shared by every
-- historical row of the same kind. Existing positive row versions remain valid.
alter table public.pro_commercial_terms
  drop constraint pro_commercial_terms_profile_kind_version;

create or replace function public.create_pro_commercial_term_draft(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_term_kind public.pro_term_kind,
  p_model public.pro_term_model,
  p_amount_minor bigint,
  p_retainer_interval public.pro_term_interval,
  p_effective_from date,
  p_effective_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_term_id uuid;
  v_result jsonb;
begin
  perform public.assert_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, true);
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_pro_profile_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  insert into public.pro_commercial_terms (
    pro_profile_id, term_kind, model, currency, amount_minor, retainer_interval,
    scope, effective_from, effective_to, status, version, created_by
  ) values (
    p_pro_profile_id, p_term_kind, p_model, 'AED', p_amount_minor,
    p_retainer_interval, 'all_registrations', p_effective_from, p_effective_to,
    'draft', 1, p_actor_id
  ) returning id into v_term_id;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    p_pro_profile_id, v_term_id, 'created', null, 'draft', p_actor_id, 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, p_pro_profile_id, 'commercial_term_created', v_term_id, 1
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', v_term_id,
    'termKind', p_term_kind::text,
    'model', p_model::text,
    'currency', 'AED',
    'amountMinor', p_amount_minor,
    'retainerInterval', p_retainer_interval::text,
    'scope', 'all_registrations',
    'effectiveFrom', p_effective_from,
    'effectiveTo', p_effective_to,
    'status', 'draft',
    'version', 1
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_pro_profile_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

alter function public.create_pro_commercial_term_draft(
  uuid, uuid, uuid, text, public.pro_term_kind, public.pro_term_model,
  bigint, public.pro_term_interval, date, date
) owner to postgres;
revoke all on function public.create_pro_commercial_term_draft(
  uuid, uuid, uuid, text, public.pro_term_kind, public.pro_term_model,
  bigint, public.pro_term_interval, date, date
) from public, anon, authenticated, service_role;
grant execute on function public.create_pro_commercial_term_draft(
  uuid, uuid, uuid, text, public.pro_term_kind, public.pro_term_model,
  bigint, public.pro_term_interval, date, date
) to service_role;

create or replace function public.activate_pro_commercial_term(
  p_actor_id uuid,
  p_term_id uuid,
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
  v_term public.pro_commercial_terms%rowtype;
  v_pro_profile_id uuid;
  v_previous public.pro_commercial_terms%rowtype;
  v_replay jsonb;
  v_result jsonb;
  v_previous_end date;
  v_updated_count integer;
  v_today date := pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date;
begin
  select pro_profile_id into v_pro_profile_id
  from public.pro_commercial_terms where id = p_term_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_term from public.pro_commercial_terms
  where id = p_term_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_term.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  if v_term.status <> 'draft'
     or v_term.effective_from > v_today
     or (v_term.effective_to is not null and v_term.effective_to < v_today) then
    raise exception using errcode = 'P0001', message = 'INVALID_TERM_TRANSITION';
  end if;

  select * into v_previous
  from public.pro_commercial_terms
  where pro_profile_id = v_term.pro_profile_id
    and term_kind = v_term.term_kind
    and status = 'active'
  for update;
  if found then
    v_previous_end := v_term.effective_from - 1;
    if v_previous_end < v_previous.effective_from then
      raise exception using errcode = 'P0001', message = 'TERM_DATE_OVERLAP';
    end if;
    update public.pro_commercial_terms
    set status = 'ended', effective_to = v_previous_end, version = version + 1
    where id = v_previous.id;
    insert into public.pro_commercial_term_events (
      pro_profile_id, commercial_term_id, event, from_status, to_status,
      actor_profile_id, term_version
    ) values (
      v_previous.pro_profile_id, v_previous.id, 'ended', 'active', 'ended',
      p_actor_id, v_previous.version + 1
    );
    perform public.write_pro_lifecycle_audit(
      p_actor_id, v_previous.pro_profile_id, 'commercial_term_ended',
      v_previous.id, v_previous.version + 1
    );
  end if;

  update public.pro_commercial_terms
  set status = 'active', version = version + 1
  where id = p_term_id
    and version = p_expected_version
    and status = 'draft';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    v_term.pro_profile_id, p_term_id, 'activated', 'draft', 'active',
    p_actor_id, v_term.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_term.pro_profile_id, 'commercial_term_activated',
    p_term_id, v_term.version + 1
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', p_term_id,
    'termKind', v_term.term_kind::text,
    'status', 'active',
    'version', v_term.version + 1
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

alter function public.activate_pro_commercial_term(uuid, uuid, bigint, uuid, text)
  owner to postgres;
revoke all on function public.activate_pro_commercial_term(uuid, uuid, bigint, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_pro_commercial_term(uuid, uuid, bigint, uuid, text)
  to service_role;

create or replace function public.end_pro_commercial_term(
  p_actor_id uuid,
  p_term_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_effective_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.pro_commercial_terms%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
  v_today date := pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date;
begin
  select pro_profile_id into v_pro_profile_id
  from public.pro_commercial_terms where id = p_term_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_term from public.pro_commercial_terms
  where id = p_term_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_term.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  if v_term.status <> 'active'
     or p_effective_to < v_term.effective_from
     or p_effective_to > v_today then
    raise exception using errcode = 'P0001', message = 'INVALID_TERM_TRANSITION';
  end if;
  update public.pro_commercial_terms
  set status = 'ended', effective_to = p_effective_to, version = version + 1
  where id = p_term_id;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    v_term.pro_profile_id, p_term_id, 'ended', 'active', 'ended',
    p_actor_id, v_term.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_term.pro_profile_id, 'commercial_term_ended',
    p_term_id, v_term.version + 1
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', p_term_id,
    'termKind', v_term.term_kind::text,
    'status', 'ended',
    'effectiveTo', p_effective_to,
    'version', v_term.version + 1
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

alter function public.end_pro_commercial_term(uuid, uuid, bigint, uuid, text, date)
  owner to postgres;
revoke all on function public.end_pro_commercial_term(uuid, uuid, bigint, uuid, text, date)
  from public, anon, authenticated, service_role;
grant execute on function public.end_pro_commercial_term(uuid, uuid, bigint, uuid, text, date)
  to service_role;

commit;
