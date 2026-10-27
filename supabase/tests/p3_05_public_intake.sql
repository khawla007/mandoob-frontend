-- P3.05 public intake: installed contract, grant, RLS, and RPC behavior proof.
-- Run against an isolated local stack (0087 omitted): psql -v ON_ERROR_STOP=1 -f this.sql
-- Wrapped in a rolled-back transaction so it is repeatable.
begin;

-- 1. Static: every durable-mutation RPC exists.
do $$
declare v_sig regprocedure;
begin
  foreach v_sig in array array[
    'public.accept_public_contact(uuid,text,jsonb,text,timestamptz,text)'::regprocedure,
    'public.create_public_application_draft(uuid,text,uuid,integer,text,timestamptz)'::regprocedure,
    'public.save_public_application_draft(uuid,text,uuid,text,bigint,jsonb)'::regprocedure,
    'public.submit_public_application(uuid,text,uuid,text,bigint,integer,integer,jsonb,jsonb)'::regprocedure,
    'public.mutate_platform_lead(uuid,uuid,text,bigint,text,text)'::regprocedure,
    'public.reserve_public_application_attachment(uuid,text,uuid,text,text,text)'::regprocedure,
    'public.finalize_public_application_attachment(uuid,uuid,text,text)'::regprocedure,
    'public.delete_public_application_attachment(uuid,uuid,text)'::regprocedure,
    'public.save_questionnaire_draft(text,text,bigint,jsonb,text)'::regprocedure,
    'public.publish_questionnaire_version(uuid,integer,bigint)'::regprocedure,
    'public.archive_questionnaire_version(uuid,integer,bigint)'::regprocedure
  ] loop null; end loop;
end $$;

-- 2. Grants: anon may call public intake RPCs but never admin lead/questionnaire mutations.
do $$
declare v_anon_ok regprocedure; v_anon_deny regprocedure;
begin
  foreach v_anon_ok in array array[
    'public.accept_public_contact(uuid,text,jsonb,text,timestamptz,text)'::regprocedure,
    'public.create_public_application_draft(uuid,text,uuid,integer,text,timestamptz)'::regprocedure,
    'public.reserve_public_application_attachment(uuid,text,uuid,text,text,text)'::regprocedure
  ] loop
    if not has_function_privilege('anon', v_anon_ok, 'EXECUTE') then
      raise exception 'ANON_GRANT_MISSING: %', v_anon_ok; end if;
  end loop;
  foreach v_anon_deny in array array[
    'public.mutate_platform_lead(uuid,uuid,text,bigint,text,text)'::regprocedure,
    'public.save_questionnaire_draft(text,text,bigint,jsonb,text)'::regprocedure,
    'public.publish_questionnaire_version(uuid,integer,bigint)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_anon_deny, 'EXECUTE') then
      raise exception 'UNEXPECTED_ANON_GRANT: %', v_anon_deny; end if;
  end loop;
end $$;

-- 3. RLS enabled + single-published index present.
do $$
declare v_t text;
begin
  foreach v_t in array array[
    'public_application_drafts','public_applications','public_application_attachments',
    'public_contact_intakes','public_intake_operations','questionnaire_definitions',
    'questionnaire_definition_versions'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.'||v_t)::regclass) then
      raise exception 'RLS_DISABLED: %', v_t; end if;
  end loop;
  if not exists (select 1 from pg_indexes where indexname = 'questionnaire_one_published_version_idx') then
    raise exception 'SINGLE_PUBLISHED_INDEX_MISSING'; end if;
end $$;

-- 4. Functional behavior.
do $$
declare
  v_admin uuid := '99999999-0000-4000-8000-000000000001';
  v_def uuid := '99999999-0000-4000-8000-0000000000d1';
  v_rh text := repeat('b', 64);
  v_contact jsonb; v_draft jsonb; v_att jsonb; v_submit jsonb;
  v_draft_id uuid; v_att_id uuid; v_lead_id uuid; v_ver bigint; v_state text;
  v_caught text;
begin
  -- Fixture: admin creator + one published questionnaire version.
  insert into auth.users(id, email) values (v_admin, 'admin@p305.local');
  insert into public.profiles(id, role, status, tenant_id) values (v_admin, 'super_admin', 'active', null);
  insert into public.questionnaire_definitions(id, definition_key, title, current_draft_version, current_published_version, row_version)
    values (v_def, 'test-questionnaire', 'Test', 1, 1, 1);
  insert into public.questionnaire_definition_versions(definition_id, version, state, definition, definition_hash, created_by, published_at)
    values (v_def, 1, 'published', '{"key":"test-questionnaire","version":1,"sections":[]}'::jsonb, repeat('a', 64), v_admin, now());

  -- Contact: accept, exact replay returns same id, changed payload under same op conflicts.
  v_contact := public.accept_public_contact(
    '00000000-0000-4000-8000-000000000001', repeat('c', 64),
    '{"email":"a@b.co"}'::jsonb, 'v1', now(), repeat('d', 64));
  if (public.accept_public_contact('00000000-0000-4000-8000-000000000001', repeat('c', 64),
        '{"email":"a@b.co"}'::jsonb, 'v1', now(), repeat('d', 64)))->>'contactId'
     <> v_contact->>'contactId' then raise exception 'CONTACT_REPLAY_MISMATCH'; end if;
  begin
    perform public.accept_public_contact('00000000-0000-4000-8000-000000000001', repeat('e', 64),
      '{"email":"a@b.co"}'::jsonb, 'v1', now(), repeat('d', 64));
    raise exception 'CONTACT_CONFLICT_NOT_RAISED';
  exception when unique_violation then null; end;

  -- Draft: create bound to the published version, save bumps version, stale save rejected.
  v_draft := public.create_public_application_draft(
    '00000000-0000-4000-8000-000000000002', repeat('c', 64), v_def, 1, v_rh, now() + interval '7 days');
  v_draft_id := (v_draft->>'draftId')::uuid;
  perform public.save_public_application_draft(v_draft_id, v_rh,
    '00000000-0000-4000-8000-000000000003', repeat('c', 64), 1, '{"fullName":"Aisha"}'::jsonb);
  begin
    perform public.save_public_application_draft(v_draft_id, v_rh,
      '00000000-0000-4000-8000-000000000004', repeat('c', 64), 1, '{"fullName":"Stale"}'::jsonb);
    raise exception 'STALE_SAVE_NOT_RAISED';
  exception when serialization_failure then null; end;

  -- Attachment: reserve, submit blocked until finalized clean+immutable.
  v_att := public.reserve_public_application_attachment(v_draft_id, v_rh,
    '00000000-0000-4000-8000-000000000005', repeat('c', 64), 'passport_copy', repeat('f', 64));
  v_att_id := (v_att->>'attachmentId')::uuid;
  begin
    perform public.submit_public_application(v_draft_id, v_rh,
      '00000000-0000-4000-8000-000000000006', repeat('c', 64), 2, 50, 1, '[]'::jsonb, '{}'::jsonb);
    raise exception 'ATTACHMENT_GATE_NOT_ENFORCED';
  exception when raise_exception then
    get stacked diagnostics v_caught = message_text;
    if v_caught <> 'ATTACHMENT_NOT_READY' then raise; end if;
  end;
  perform public.finalize_public_application_attachment(v_att_id, v_draft_id, v_rh,
    'public-intake/' || v_draft_id || '/' || v_att_id || '.pdf');

  -- Submit succeeds once attachments are clean; creates exactly one lead + application.
  v_submit := public.submit_public_application(v_draft_id, v_rh,
    '00000000-0000-4000-8000-000000000006', repeat('c', 64), 2, 50, 1, '[]'::jsonb, '{"v":"1"}'::jsonb);
  v_lead_id := (v_submit->>'leadId')::uuid;
  if v_lead_id is null then raise exception 'SUBMIT_NO_LEAD'; end if;
  if (select count(*) from public.public_applications where lead_id = v_lead_id) <> 1 then
    raise exception 'SUBMIT_NOT_EXACTLY_ONE_APPLICATION'; end if;

  -- Lead mutation is forbidden without an AAL2 admin JWT.
  begin
    perform public.mutate_platform_lead(v_lead_id, '00000000-0000-4000-8000-000000000007',
      repeat('c', 64), 1, 'stage', 'qualified');
    raise exception 'LEAD_MUTATION_NOT_GUARDED';
  exception when insufficient_privilege then null; end;

  -- With an AAL2 admin JWT: mutate succeeds, replays, and rejects stale versions.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'aal', 'aal2')::text, true);
  v_ver := (public.mutate_platform_lead(v_lead_id, '00000000-0000-4000-8000-000000000008',
    repeat('c', 64), 1, 'stage', 'qualified'))->>'version';
  if v_ver <> 2 then raise exception 'LEAD_VERSION_NOT_BUMPED: %', v_ver; end if;
  if (public.mutate_platform_lead(v_lead_id, '00000000-0000-4000-8000-000000000008',
        repeat('c', 64), 1, 'stage', 'qualified'))->>'version' <> '2' then
    raise exception 'LEAD_REPLAY_MISMATCH'; end if;
  begin
    perform public.mutate_platform_lead(v_lead_id, '00000000-0000-4000-8000-000000000009',
      repeat('c', 64), 1, 'stage', 'contacted');
    raise exception 'LEAD_STALE_NOT_RAISED';
  exception when serialization_failure then null; end;

  -- Questionnaire publishing keeps published definitions immutable across a later draft.
  perform public.save_questionnaire_draft('reg-questionnaire', 'Registration', 0,
    '{"key":"reg-questionnaire","version":1,"sections":[]}'::jsonb, repeat('1', 64));
  perform public.publish_questionnaire_version(
    (select id from public.questionnaire_definitions where definition_key = 'reg-questionnaire'), 1,
    (select row_version from public.questionnaire_definitions where definition_key = 'reg-questionnaire'));
  perform public.save_questionnaire_draft('reg-questionnaire', 'Registration v2',
    (select row_version from public.questionnaire_definitions where definition_key = 'reg-questionnaire'),
    '{"key":"reg-questionnaire","version":2,"sections":[{"id":"s1"}]}'::jsonb, repeat('2', 64));
  select definition_hash into v_state from public.questionnaire_definition_versions
    where definition_id = (select id from public.questionnaire_definitions where definition_key = 'reg-questionnaire')
      and version = 1;
  if v_state <> repeat('1', 64) then raise exception 'PUBLISHED_DEFINITION_MUTATED'; end if;

  raise notice 'P3_05_FUNCTIONAL_OK lead=% application_count=1', v_lead_id;
end $$;

select 'P3_05_SQL_PROOF_OK' as result;
rollback;
