\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('91860000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'term-integrity-admin@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now()),
  ('91860000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'term-integrity-pro@example.invalid', 'synthetic', now(),
   '{}', '{}', now(), now());

insert into public.profiles (id, role, status, full_name) values
  ('91860000-0000-4000-8000-000000000001', 'admin', 'active', 'Term Integrity Operator'),
  ('91860000-0000-4000-8000-000000000002', 'pro', 'active', 'Term Integrity PRO');
insert into public.pro_profiles (profile_id)
values ('91860000-0000-4000-8000-000000000002');

insert into public.pro_credentials (
  pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by
) values (
  '91860000-0000-4000-8000-000000000002', 'synthetic-ciphertext', repeat('8', 64), 'T086',
  'Synthetic Authority', current_date - 365, current_date + 365,
  'verified', 1, now(), '91860000-0000-4000-8000-000000000001'
);

do $$
declare
  v_actor_id constant uuid := '91860000-0000-4000-8000-000000000001';
  v_pro_id constant uuid := '91860000-0000-4000-8000-000000000002';
  v_today date := pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date;
  v_term_kind public.pro_term_kind;
  v_model public.pro_term_model;
  v_interval public.pro_term_interval;
  v_amount bigint;
  v_rotation integer;
  v_result jsonb;
  v_replay jsonb;
  v_active_id uuid;
  v_draft_id uuid;
  v_operation_id uuid;
  v_payload_hash text;
  v_term_count integer;
  v_active_count integer;
  v_ended_count integer;
  v_created_events integer;
  v_activated_events integer;
  v_ended_events integer;
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.pro_commercial_terms'::regclass
      and conname = 'pro_commercial_terms_profile_kind_version'
  ) then
    raise exception 'CROSS_ROW_VERSION_UNIQUENESS_REMAINS';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.pro_commercial_terms'::regclass
      and conname = 'pro_commercial_terms_profile_identity'
  ) then
    raise exception 'MISSING_TERM_OWNERSHIP_CONSTRAINT';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.pro_commercial_terms'::regclass
      and conname = 'pro_commercial_terms_active_date_exclusion'
  ) then
    raise exception 'MISSING_ACTIVE_DATE_EXCLUSION';
  end if;

  foreach v_term_kind in array array[
    'pricing'::public.pro_term_kind,
    'compensation'::public.pro_term_kind
  ] loop
    if v_term_kind = 'pricing' then
      v_model := 'per_registration';
      v_interval := null;
      v_amount := 12500;
    else
      v_model := 'retainer';
      v_interval := 'monthly';
      v_amount := 500000;
    end if;

    v_result := public.create_pro_commercial_term_draft(
      v_actor_id, v_pro_id, gen_random_uuid(), repeat('1', 64),
      v_term_kind, v_model, v_amount, v_interval, v_today - 4, null
    );
    if (v_result ->> 'version')::bigint <> 1 then
      raise exception 'EXPECTED_ROW_LOCAL_DRAFT_VERSION';
    end if;
    v_active_id := (v_result ->> 'termId')::uuid;
    perform public.activate_pro_commercial_term(
      v_actor_id, v_active_id, 1, gen_random_uuid(), repeat('2', 64)
    );

    for v_rotation in 1..2 loop
      v_result := public.create_pro_commercial_term_draft(
        v_actor_id, v_pro_id, gen_random_uuid(), repeat('3', 64),
        v_term_kind, v_model, v_amount + v_rotation, v_interval,
        v_today - (4 - v_rotation), null
      );
      if (v_result ->> 'version')::bigint <> 1 then
        raise exception 'EXPECTED_ROW_LOCAL_ROTATION_VERSION';
      end if;
      v_active_id := (v_result ->> 'termId')::uuid;
      v_operation_id := gen_random_uuid();
      v_payload_hash := repeat('4', 64);
      v_result := public.activate_pro_commercial_term(
        v_actor_id, v_active_id, 1, v_operation_id, v_payload_hash
      );
      v_replay := public.activate_pro_commercial_term(
        v_actor_id, v_active_id, 1, v_operation_id, v_payload_hash
      );
      if v_replay <> v_result then
        raise exception 'TERM_ACTIVATION_REPLAY_CHANGED';
      end if;
    end loop;

    select
      count(*),
      count(*) filter (where status = 'active'),
      count(*) filter (where status = 'ended')
    into v_term_count, v_active_count, v_ended_count
    from public.pro_commercial_terms
    where pro_profile_id = v_pro_id and term_kind = v_term_kind;
    if v_term_count <> 3 or v_active_count <> 1 or v_ended_count <> 2 then
      raise exception 'EXPECTED_TWO_SUCCESSIVE_ROTATIONS';
    end if;
    if not exists (
      select 1 from public.pro_commercial_terms
      where id = v_active_id and status = 'active'
        and effective_from = v_today - 2 and effective_to is null and version = 2
    ) or (
      select count(*) from public.pro_commercial_terms
      where pro_profile_id = v_pro_id and term_kind = v_term_kind
        and status = 'ended' and version = 3
    ) <> 2 then
      raise exception 'INVALID_ROTATION_HISTORY';
    end if;
    select
      count(*) filter (where event = 'created'),
      count(*) filter (where event = 'activated'),
      count(*) filter (where event = 'ended')
    into v_created_events, v_activated_events, v_ended_events
    from public.pro_commercial_term_events
    where pro_profile_id = v_pro_id
      and commercial_term_id in (
        select id from public.pro_commercial_terms
        where pro_profile_id = v_pro_id and term_kind = v_term_kind
      );
    if v_created_events <> 3 or v_activated_events <> 3 or v_ended_events <> 2 then
      raise exception 'MISSING_ROTATION_EVENTS';
    end if;

    begin
      perform public.activate_pro_commercial_term(
        v_actor_id, v_active_id, 1, gen_random_uuid(), repeat('5', 64)
      );
      raise exception 'EXPECTED_STALE_TERM_VERSION';
    exception when others then
      if sqlerrm <> 'STALE_TERM_VERSION' then raise; end if;
    end;

    v_result := public.create_pro_commercial_term_draft(
      v_actor_id, v_pro_id, gen_random_uuid(), repeat('6', 64),
      v_term_kind, v_model, v_amount + 3, v_interval, v_today - 1, v_today + 1
    );
    v_draft_id := (v_result ->> 'termId')::uuid;
    perform public.activate_pro_commercial_term(
      v_actor_id, v_draft_id, 1, gen_random_uuid(), repeat('7', 64)
    );
    if not exists (
      select 1 from public.pro_commercial_terms
      where id = v_draft_id and status = 'active'
        and effective_from = v_today - 1 and effective_to = v_today + 1 and version = 2
    ) or not exists (
      select 1 from public.pro_commercial_terms
      where id = v_draft_id and status = 'active'
        and effective_from <= v_today and effective_to >= v_today
    ) then
      raise exception 'EXPECTED_FIXED_DURATION_TERM_ACTIVATION';
    end if;
    v_active_id := v_draft_id;

    v_result := public.create_pro_commercial_term_draft(
      v_actor_id, v_pro_id, gen_random_uuid(), repeat('8', 64),
      v_term_kind, v_model, v_amount + 4, v_interval, v_today + 1, null
    );
    v_draft_id := (v_result ->> 'termId')::uuid;
    begin
      perform public.activate_pro_commercial_term(
        v_actor_id, v_draft_id, 1, gen_random_uuid(), repeat('9', 64)
      );
      raise exception 'EXPECTED_FUTURE_ACTIVATION_REJECTION';
    exception when others then
      if sqlerrm <> 'INVALID_TERM_TRANSITION' then raise; end if;
    end;
    if not exists (
      select 1 from public.pro_commercial_terms
      where id = v_active_id and status = 'active'
        and effective_to = v_today + 1 and version = 2
    ) or not exists (
      select 1 from public.pro_commercial_terms
      where id = v_draft_id and status = 'draft' and version = 1
    ) then
      raise exception 'FUTURE_ACTIVATION_CHANGED_CURRENT_TERM';
    end if;

    begin
      perform public.end_pro_commercial_term(
        v_actor_id, v_active_id, 2, gen_random_uuid(), repeat('a', 64), v_today + 1
      );
      raise exception 'EXPECTED_FUTURE_END_REJECTION';
    exception when others then
      if sqlerrm <> 'INVALID_TERM_TRANSITION' then raise; end if;
    end;
    if not exists (
      select 1 from public.pro_commercial_terms
      where id = v_active_id and status = 'active'
        and effective_to = v_today + 1 and version = 2
    ) then
      raise exception 'FUTURE_END_CHANGED_CURRENT_TERM';
    end if;
  end loop;

  v_result := public.evaluate_pro_assignment_eligibility(v_pro_id, null);
  if (v_result ->> 'eligible')::boolean is not true
     or v_result -> 'codes' <> '[]'::jsonb then
    raise exception 'EXPECTED_FIXED_DURATION_TERM_ELIGIBILITY';
  end if;
  if not exists (
    select 1 from public.auth_events
    where kind = 'pro_lifecycle_changed'
      and actor_user_id = v_actor_id
      and details ->> 'action' = 'commercial_term_ended'
  ) then
    raise exception 'MISSING_ROTATION_AUDIT';
  end if;
end;
$$;

rollback;
