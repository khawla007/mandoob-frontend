\set ON_ERROR_STOP on
set statement_timeout = '60s';
begin;

-- ---------------------------------------------------------------------------
-- P3.06 Registration & Visa Workflow — rolled-back pgSQL assertion proof.
--
-- Exercises the SECURITY DEFINER command + read RPCs and the schema/RLS/grant
-- contract of migration 0107. All command RPCs authorize on p_actor_id, not
-- auth.uid(), so the happy path runs as the postgres owner (which owns the
-- functions and bypasses EXECUTE grants — exactly how service_role reaches
-- them). RLS read-policy behavior is checked separately under
-- `set local role authenticated` with a synthetic JWT.
--
-- Naming: pg_temp.uid(n) deterministic uuids; pg_temp.check(ok,label) asserts.
-- Expected failures are wrapped in begin/exception when sqlstate '<code>'.
-- ---------------------------------------------------------------------------

-- 1. Schema gate: all 8 tables + key enums must exist.
do $$
declare
  v_missing text;
  v_table text;
  v_enum text;
begin
  foreach v_table in array array[
    'company_registrations','registration_stages','registration_stage_documents',
    'registration_visa_people','registration_stage_events','registration_visa_events',
    'registration_domain_events','registration_operation_receipts'
  ] loop
    if to_regclass('public.'||v_table) is null then
      raise exception using errcode = 'P0001',
        message = 'SCHEMA_MISSING', detail = v_table;
    end if;
  end loop;
  foreach v_enum in array array[
    'registration_stage_code','registration_stage_status','registration_status',
    'registration_person_kind','registration_visa_kind','registration_visa_status',
    'registration_visa_stage_code','registration_document_role','registration_operation_kind'
  ] loop
    if not exists (select 1 from pg_type where typname = v_enum) then
      raise exception using errcode = 'P0001',
        message = 'SCHEMA_MISSING', detail = v_enum;
    end if;
  end loop;
end;
$$;

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030600-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', label; end if;
end;
$$;
-- 64-hex payload hash helper (receipts require ^[0-9a-f]{64}$).
create function pg_temp.hash(n integer) returns text language sql immutable as $$
  select lpad(to_hex(n), 64, '0');
$$;

-- ---------------------------------------------------------------------------
-- Seed: two tenants (A active, B foreign), auth.users + profiles for all roles,
-- company/customer/employee/pro base rows required by RLS + authorize helpers.
-- ---------------------------------------------------------------------------
-- Tenant C hosts an isolated company for the idempotency/version/guard proofs
-- (company_profiles enforces one company per tenant, so a fresh registration
-- needs a fresh tenant rather than a second company under tenant A).
insert into public.tenants(id, slug, name, status) values
  (pg_temp.uid(100), 'reg-visa-a', 'Synthetic Tenant A', 'active'),
  (pg_temp.uid(200), 'reg-visa-b', 'Synthetic Tenant B', 'active'),
  (pg_temp.uid(300), 'reg-visa-c', 'Synthetic Tenant C', 'active');

insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'reg-visa-' || n || '@example.invalid',
  '', now(), '{}', '{}', now(), now() from generate_series(1, 9) n;

-- Actors: 1 admin(aal2/mfa), 2 pro(A), 3 customer(A), 4 employee(A),
-- 5 disabled customer(A), 6 pro assigned to B (foreign), 7 customer of B.
--
-- NOTE: PRO profiles are seeded with the tenant_id of their assigned company.
-- create_company_registration sets service_cases.assigned_to = the PRO, and the
-- pre-existing enforce_service_case_pro_assignee() trigger (migration 0052)
-- requires profiles.tenant_id = service_cases.tenant_id for the assignee. A
-- tenant-null PRO therefore fails that trigger. The profiles_tenant_required
-- CHECK explicitly permits a 'pro' to carry a tenant_id, and
-- authorize_pro_company_access / has_company_access resolve PRO scope from
-- pro_company_assignments (not profiles.tenant_id), so a tenant-scoped PRO
-- satisfies both. See the run report for this migration interaction.
insert into public.profiles(id, tenant_id, role, status, mfa_enrolled_at) values
  (pg_temp.uid(1), null,            'admin',    'active',   now()),
  (pg_temp.uid(2), pg_temp.uid(100),'pro',      'active',   null),
  (pg_temp.uid(3), pg_temp.uid(100),'customer', 'active',   null),
  (pg_temp.uid(4), pg_temp.uid(100),'employee', 'active',   null),
  (pg_temp.uid(5), pg_temp.uid(100),'customer', 'disabled', null),
  (pg_temp.uid(6), pg_temp.uid(200),'pro',      'active',   null),
  (pg_temp.uid(7), pg_temp.uid(200),'customer', 'active',   null),
  (pg_temp.uid(8), null,            'admin',    'active',   null), -- admin WITHOUT mfa
  (pg_temp.uid(9), pg_temp.uid(300),'pro',      'active',   null); -- PRO for tenant C

insert into public.company_profiles(
  id, tenant_id, company_name, status,
  licensing_authority, jurisdiction_type, legal_structure,
  trade_license_no, license_expiry) values
  (pg_temp.uid(101), pg_temp.uid(100), 'Synthetic Co A', 'active',
    'DED', 'mainland', 'llc', 'CN-1001', current_date + 365),
  (pg_temp.uid(201), pg_temp.uid(200), 'Synthetic Co B', 'active',
    'DED', 'mainland', 'llc', 'CN-2001', current_date + 365),
  (pg_temp.uid(301), pg_temp.uid(300), 'Synthetic Co C', 'active',
    'DED', 'mainland', 'llc', 'CN-3001', current_date + 365);

insert into public.customer_profiles(profile_id, linked_company_id) values
  (pg_temp.uid(3), pg_temp.uid(101)),
  (pg_temp.uid(5), pg_temp.uid(101)),
  (pg_temp.uid(7), pg_temp.uid(201));

insert into public.employees(id, tenant_id, company_id, profile_id, name, status) values
  (pg_temp.uid(110), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(4), 'Synthetic Employee A', 'active'),
  (pg_temp.uid(111), pg_temp.uid(100), pg_temp.uid(101), null, 'Synthetic Employee A2', 'active');

insert into public.company_shareholders(
  id, tenant_id, company_id, kind, ownership_percent, sort_order,
  full_name, nationality_code) values
  (pg_temp.uid(150), pg_temp.uid(100), pg_temp.uid(101), 'individual', 100, 1,
    'Synthetic Shareholder', 'AE');

-- PRO 2 -> company A; PRO 6 -> company B; PRO 9 -> company C. All verified.
insert into public.pro_profiles(profile_id) values (pg_temp.uid(2)), (pg_temp.uid(6)), (pg_temp.uid(9));
insert into public.pro_credentials(id, pro_profile_id, credential_type,
  identifier_ciphertext, identifier_hash, identifier_last4, issuing_authority,
  issue_date, expiry_date, state, version, submitted_at, created_by) values
  (pg_temp.uid(20), pg_temp.uid(2), 'pro_license', 'synthetic', repeat('a',64),
    'AA20', 'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1)),
  (pg_temp.uid(60), pg_temp.uid(6), 'pro_license', 'synthetic', repeat('b',64),
    'BB60', 'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1)),
  (pg_temp.uid(90), pg_temp.uid(9), 'pro_license', 'synthetic', repeat('9',64),
    '9990', 'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1));
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by) values
  (pg_temp.uid(21), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(2), pg_temp.uid(1)),
  (pg_temp.uid(61), pg_temp.uid(200), pg_temp.uid(201), pg_temp.uid(6), pg_temp.uid(1)),
  (pg_temp.uid(91), pg_temp.uid(300), pg_temp.uid(301), pg_temp.uid(9), pg_temp.uid(1));

-- Approved document versions for evidence linking. Insert with a synthetic
-- storage_path that matches no upload operation and upload_operation_id=null so
-- the upload-binding guards pass; then flip review_status to 'approved' (the
-- version immutability trigger explicitly whitelists review_* columns).
insert into public.documents(id, tenant_id, company_id, doc_type, label) values
  (pg_temp.uid(170), pg_temp.uid(100), pg_temp.uid(101), 'other', 'Application Form A');
insert into public.document_versions(
  id, document_id, tenant_id, storage_path, mime_type, size_bytes, sha256,
  upload_operation_id, review_status) values
  (pg_temp.uid(171), pg_temp.uid(170), pg_temp.uid(100),
    pg_temp.uid(100)::text||'/'||pg_temp.uid(101)::text||'/documents/seed/'||pg_temp.uid(171)::text||'.pdf',
    'application/pdf', 8, repeat('c',64), null, 'pending');
update public.document_versions set review_status = 'approved', reviewed_by = pg_temp.uid(1), reviewed_at = now()
  where id = pg_temp.uid(171);

-- ---------------------------------------------------------------------------
-- 2. GRANTS (security): every command + read RPC must be denied to anon and
--    authenticated, granted to service_role. This is the anon-EXECUTE trap.
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  for signature in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in (
      'create_company_registration','transition_registration_stage',
      'link_registration_stage_document','unlink_registration_stage_document',
      'recover_unlink_registration_stage_document','create_registration_visa_person',
      'transition_registration_visa_person','cancel_registration_visa_person',
      'read_pro_registration_workflow','read_operator_registration_workflow',
      'read_customer_registration_progress','read_admin_registration_index',
      'resolve_company_active_registration','read_employee_visa_person'
    )
  loop
    perform pg_temp.check(
      not has_function_privilege('anon', signature, 'EXECUTE')
      and not has_function_privilege('authenticated', signature, 'EXECUTE')
      and has_function_privilege('service_role', signature, 'EXECUTE'),
      'RPC_EXECUTE_ACLS:'||signature);
  end loop;
  perform pg_temp.check(
    not has_function_privilege('anon', 'public.authorize_registration_mutation(uuid,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.authorize_registration_mutation(uuid,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.authorize_registration_mutation(uuid,text,uuid,uuid)', 'EXECUTE'),
    'HELPER_NOT_EXECUTABLE');
  -- Workflow tables carry no direct DML for anon/authenticated/service_role;
  -- only SELECT is granted to authenticated (RLS-gated).
  perform pg_temp.check(
    not has_table_privilege('anon','public.company_registrations','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role','public.company_registrations','INSERT,UPDATE,DELETE')
    and has_table_privilege('authenticated','public.company_registrations','SELECT'),
    'TABLE_DML_ACLS');
  -- RLS enabled on all eight tables.
  perform pg_temp.check((
    select bool_and(relrowsecurity) from pg_class
    where oid in (
      'public.company_registrations'::regclass,'public.registration_stages'::regclass,
      'public.registration_stage_documents'::regclass,'public.registration_visa_people'::regclass,
      'public.registration_stage_events'::regclass,'public.registration_visa_events'::regclass,
      'public.registration_domain_events'::regclass,'public.registration_operation_receipts'::regclass)),
    'RLS_ENABLED');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Happy path (as postgres owner == service_role reach). Full lifecycle:
--    create -> stage 1 start/complete -> advance to visa -> visa person
--    milestones -> complete visa -> complete visa_processing/bank/completed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg jsonb;
  v_reg_id uuid;
  v_stage_id uuid;
  v_stage_ver bigint;
  v_reg_ver bigint;
  v_link jsonb;
  v_person jsonb;
  v_person_id uuid;
  v_visa_ver bigint;
  v_tr jsonb;
  v_pro jsonb;
  v_cust jsonb;
  v_oper jsonb;
  v_op integer := 5000;
begin
  -- create
  v_reg := public.create_company_registration(
    pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101),
    'Synthetic Registration', 'normal', now() + interval '30 days',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  v_reg_id := (v_reg->>'registrationId')::uuid;
  perform pg_temp.check(v_reg_id is not null, 'CREATE_RETURNS_ID');
  perform pg_temp.check((v_reg->>'status') = 'in_progress'
    and (v_reg->>'currentStage') = 'application_submitted'
    and (v_reg->>'registrationVersion') = '1'
    and (v_reg->>'currentStageVersion') = '1', 'CREATE_RECEIPT_SHAPE');

  -- 7 stages auto-created in ordinal order 1..7, stage 1 in_progress
  perform pg_temp.check((
    select array_agg(code::text order by ordinal) = array[
      'application_submitted','initial_approval','name_reservation',
      'license_issuance','visa_processing','bank_account','completed']
    from public.registration_stages where registration_id = v_reg_id),
    'SEVEN_STAGES_ORDERED');
  perform pg_temp.check((
    select count(*) = 1 from public.registration_stages
    where registration_id = v_reg_id and ordinal = 1
      and status = 'in_progress' and version = 1), 'STAGE1_IN_PROGRESS');

  -- link approved application_form doc to stage 1 (must be current stage)
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'application_submitted';
  v_op := v_op + 1;
  v_link := public.link_registration_stage_document(
    pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_stage_id,
    pg_temp.uid(170), pg_temp.uid(171), 'application_form',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((v_link->>'linkId') is not null
    and (v_link->>'role') = 'application_form', 'LINK_DOCUMENT_SUCCESS');

  -- complete stage 1 (requires approved application_form + applicationSubmittedOn)
  v_op := v_op + 1;
  v_tr := public.transition_registration_stage(
    pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_stage_id,
    'complete', 1, v_stage_ver,
    jsonb_build_object('applicationSubmittedOn', to_char(current_date, 'YYYY-MM-DD')),
    null, null, pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((v_tr->>'stageStatus') = 'completed'
    and (v_tr->>'currentStage') = 'initial_approval'
    and (v_tr->>'transitionCode') = 'advanced'
    and (v_tr->>'registrationVersion') = '2', 'STAGE1_COMPLETE_ADVANCES');

  -- Drive stages 2..4 to reach visa_processing (start each, then complete).
  -- stage 2 initial_approval: needs approval_letter doc + approvalReceivedOn.
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'initial_approval';
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'start', 2, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  -- seed + link an approved approval_letter document for stage 2
  insert into public.documents(id, tenant_id, company_id, doc_type, label)
    values (pg_temp.uid(172), pg_temp.uid(100), pg_temp.uid(101), 'other', 'Approval Letter');
  insert into public.document_versions(id, document_id, tenant_id, storage_path,
    mime_type, size_bytes, sha256, upload_operation_id, review_status)
    values (pg_temp.uid(173), pg_temp.uid(172), pg_temp.uid(100),
      pg_temp.uid(100)::text||'/'||pg_temp.uid(101)::text||'/documents/seed/'||pg_temp.uid(173)::text||'.pdf',
      'application/pdf', 8, repeat('d',64), null, 'pending');
  update public.document_versions set review_status = 'approved' where id = pg_temp.uid(173);
  v_op := v_op + 1;
  perform public.link_registration_stage_document(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, pg_temp.uid(172), pg_temp.uid(173), 'approval_letter',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  select version into v_stage_ver from public.registration_stages where id = v_stage_id;
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'complete', v_reg_ver, v_stage_ver,
    jsonb_build_object('approvalReceivedOn', to_char(current_date, 'YYYY-MM-DD')),
    null, null, pg_temp.uid(v_op), pg_temp.hash(v_op));

  -- stage 3 name_reservation: start then complete with name detail bundle.
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'name_reservation';
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'start', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  select version into v_stage_ver from public.registration_stages where id = v_stage_id;
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'complete', v_reg_ver, v_stage_ver,
    jsonb_build_object('nameOptions', jsonb_build_array('Synthetic Trade Name'),
      'approvedName', 'Synthetic Trade Name', 'approvedNameVersion', 1),
    null, null, pg_temp.uid(v_op), pg_temp.hash(v_op));

  -- stage 4 license_issuance: start, link approved trade_license, complete.
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'license_issuance';
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'start', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  insert into public.documents(id, tenant_id, company_id, doc_type, label)
    values (pg_temp.uid(174), pg_temp.uid(100), pg_temp.uid(101), 'trade_license', 'Trade License');
  insert into public.document_versions(id, document_id, tenant_id, storage_path,
    mime_type, size_bytes, sha256, upload_operation_id, review_status)
    values (pg_temp.uid(175), pg_temp.uid(174), pg_temp.uid(100),
      pg_temp.uid(100)::text||'/'||pg_temp.uid(101)::text||'/documents/seed/'||pg_temp.uid(175)::text||'.pdf',
      'application/pdf', 8, repeat('e',64), null, 'pending');
  update public.document_versions set review_status = 'approved' where id = pg_temp.uid(175);
  v_op := v_op + 1;
  perform public.link_registration_stage_document(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, pg_temp.uid(174), pg_temp.uid(175), 'trade_license',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  select version into v_stage_ver from public.registration_stages where id = v_stage_id;
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'complete', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));

  -- Now at visa_processing. Start the stage so visa people can be created.
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'visa_processing';
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  perform pg_temp.check((select current_stage::text from public.company_registrations
    where id = v_reg_id) = 'visa_processing', 'ADVANCED_TO_VISA_PROCESSING');
  v_op := v_op + 1;
  perform public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'start', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));

  -- create a visa person (shareholder/investor) and walk its milestones.
  v_op := v_op + 1;
  v_person := public.create_registration_visa_person(
    pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101), v_reg_id,
    'shareholder', pg_temp.uid(150), null, 'Synthetic Shareholder', 'investor',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  v_person_id := (v_person->>'visaPersonId')::uuid;
  perform pg_temp.check((v_person->>'status') = 'not_started'
    and (v_person->>'currentStage') = 'documents_ready'
    and (v_person->>'visaVersion') = '1', 'VISA_PERSON_CREATED');

  -- start (stays documents_ready, in_progress), then advance through all 6 stages
  v_op := v_op + 1;
  v_tr := public.transition_registration_visa_person(
    pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_person_id,
    'start', 'documents_ready', 1, null, null, pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((v_tr->>'status') = 'in_progress', 'VISA_STARTED');
  declare
    v_stages text[] := array['entry_permit','status_adjustment','medical_fitness','emirates_id','residency_issued'];
    v_next text;
  begin
    foreach v_next in array v_stages loop
      select version into v_visa_ver from public.registration_visa_people where id = v_person_id;
      v_op := v_op + 1;
      if v_next = 'entry_permit' then
        -- Operator (admin, MFA, aal2) runs one milestone advance.
        perform public.transition_registration_visa_person(
          pg_temp.uid(1), 'aal2', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_person_id,
          'advance', v_next::public.registration_visa_stage_code, v_visa_ver, null, null,
          pg_temp.uid(v_op), pg_temp.hash(v_op));
        perform pg_temp.check((select actor_category from public.registration_visa_events
          where operation_id = pg_temp.uid(v_op)) = 'operator', 'VISA_OPERATOR_EVENT_CATEGORY');
      else
        perform public.transition_registration_visa_person(
          pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_person_id,
          'advance', v_next::public.registration_visa_stage_code, v_visa_ver, null, null,
          pg_temp.uid(v_op), pg_temp.hash(v_op));
      end if;
    end loop;
  end;
  -- complete at residency_issued
  select version into v_visa_ver from public.registration_visa_people where id = v_person_id;
  v_op := v_op + 1;
  v_tr := public.transition_registration_visa_person(
    pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id, v_person_id,
    'complete', 'residency_issued', v_visa_ver, null, null, pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((v_tr->>'status') = 'completed'
    and (v_tr->>'currentStage') = 'residency_issued', 'VISA_COMPLETED');

  -- Operator cancels a second (employee) visa person; PRO may not use OPERATOR_CANCELLED.
  v_op := v_op + 1;
  v_person := public.create_registration_visa_person(
    pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101), v_reg_id,
    'employee', null, pg_temp.uid(111), 'Synthetic Employee A2', 'employee',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((select actor_category from public.registration_visa_events
    where operation_id = pg_temp.uid(v_op)) = 'pro', 'VISA_CREATE_EVENT_CATEGORY');
  begin
    v_op := v_op + 1;
    perform public.cancel_registration_visa_person(
      pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101), v_reg_id,
      (v_person->>'visaPersonId')::uuid, 1, 'OPERATOR_CANCELLED', 'Operator only reason',
      pg_temp.uid(v_op), pg_temp.hash(v_op));
    raise exception 'PRO_USED_OPERATOR_CANCELLED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'INVALID_VISA_REASON' then raise exception 'PRO_CANCEL_REASON_WRONG:%', sqlerrm; end if;
  end;
  v_op := v_op + 1;
  perform public.cancel_registration_visa_person(
    pg_temp.uid(1), 'aal2', pg_temp.uid(100), pg_temp.uid(101), v_reg_id,
    (v_person->>'visaPersonId')::uuid, 1, 'OPERATOR_CANCELLED', 'Duplicate intake by operator',
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((select actor_category from public.registration_visa_events
    where operation_id = pg_temp.uid(v_op)) = 'operator', 'VISA_OPERATOR_CANCEL_CATEGORY');

  -- complete visa_processing (all non-cancelled people completed at residency).
  select version into v_stage_ver from public.registration_stages where id = v_stage_id;
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  v_op := v_op + 1;
  v_tr := public.transition_registration_stage(pg_temp.uid(2), 'aal1', pg_temp.uid(100), pg_temp.uid(101),
    v_reg_id, v_stage_id, 'complete', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
    pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check((v_tr->>'currentStage') = 'bank_account', 'VISA_STAGE_COMPLETE');

  -- Read RPCs return coherent jsonb before terminal completion.
  v_pro := public.read_pro_registration_workflow(pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101), v_reg_id);
  perform pg_temp.check((v_pro->>'registrationId')::uuid = v_reg_id
    and jsonb_array_length(v_pro->'stages') = 7
    -- shareholder (completed) + operator-cancelled employee person
    and jsonb_array_length(v_pro->'visaPeople') = 2
    and (select count(*) from jsonb_array_elements(v_pro->'visaPeople') p
         where p->>'status' = 'cancelled') = 1
    and jsonb_array_length(v_pro->'documents') = 3, 'READ_PRO_COHERENT');

  v_cust := public.read_customer_registration_progress(pg_temp.uid(3), v_reg_id);
  perform pg_temp.check((v_cust->>'registrationId')::uuid = v_reg_id
    and (v_cust->>'totalStages') = '7'
    and (v_cust->>'completedStages')::int = 5, 'READ_CUSTOMER_COHERENT');

  v_oper := public.read_operator_registration_workflow(pg_temp.uid(1), 'aal2', v_reg_id);
  perform pg_temp.check((v_oper->>'registrationId')::uuid = v_reg_id
    and (v_oper->>'tenantId')::uuid = pg_temp.uid(100)
    and jsonb_array_length(v_oper->'stages') = 7, 'READ_OPERATOR_COHERENT');
  -- operator read wrote a cross-tenant audit row.
  perform pg_temp.check(exists(
    select 1 from public.tenant_audit_log
    where tenant_id = pg_temp.uid(100) and actor_id = pg_temp.uid(1)
      and details->>'entity' = 'registration_operator_read'), 'OPERATOR_READ_AUDITED');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Idempotency: replay same op+hash returns identical receipt (no dup row);
--    same op + changed hash raises OPERATION_REUSED.
-- ---------------------------------------------------------------------------
do $$
declare
  v_first jsonb; v_replay jsonb; v_reg_id uuid;
  v_op integer := 6000;
  v_before bigint; v_after bigint;
begin
  -- Isolated registration on tenant C / company C (fresh, no active reg there).
  v_first := public.create_company_registration(
    pg_temp.uid(9), pg_temp.uid(300), pg_temp.uid(301),
    'Idem Registration', 'normal', null, pg_temp.uid(v_op), pg_temp.hash(v_op));
  v_reg_id := (v_first->>'registrationId')::uuid;
  select count(*) into v_after from public.company_registrations;

  v_replay := public.create_company_registration(
    pg_temp.uid(9), pg_temp.uid(300), pg_temp.uid(301),
    'Idem Registration', 'normal', null, pg_temp.uid(v_op), pg_temp.hash(v_op));
  perform pg_temp.check(v_first = v_replay, 'IDEMPOTENT_REPLAY_IDENTICAL');
  perform pg_temp.check((select count(*) from public.company_registrations) = v_after,
    'IDEMPOTENT_NO_DUPLICATE_ROW');

  -- Same operation_id, different payload_hash -> OPERATION_REUSED.
  begin
    perform public.create_company_registration(
      pg_temp.uid(9), pg_temp.uid(300), pg_temp.uid(301),
      'Idem Registration', 'normal', null, pg_temp.uid(v_op), pg_temp.hash(v_op + 999999));
    raise exception 'OPERATION_REUSED_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'OPERATION_REUSED' then raise exception 'IDEM_WRONG_CODE:%', sqlerrm; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Optimistic concurrency: wrong expected version -> STALE_*_VERSION.
-- ---------------------------------------------------------------------------
do $$
declare v_reg_id uuid; v_stage_id uuid;
begin
  select r.id, s.id into v_reg_id, v_stage_id
  from public.company_registrations r
  join public.registration_stages s
    on s.registration_id = r.id and s.code = r.current_stage
  where r.company_id = pg_temp.uid(301);

  -- wrong registration version
  begin
    perform public.transition_registration_stage(pg_temp.uid(9), 'aal1', pg_temp.uid(300), pg_temp.uid(301),
      v_reg_id, v_stage_id, 'start', 99999, 1, '{}'::jsonb, null, null,
      pg_temp.uid(6100), pg_temp.hash(6100));
    raise exception 'STALE_REG_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'STALE_REGISTRATION_VERSION' then raise exception 'STALE_REG_WRONG:%', sqlerrm; end if;
  end;

  -- wrong stage version (correct reg version)
  begin
    perform public.transition_registration_stage(pg_temp.uid(9), 'aal1', pg_temp.uid(300), pg_temp.uid(301),
      v_reg_id, v_stage_id, 'start',
      (select version from public.company_registrations where id = v_reg_id), 99999,
      '{}'::jsonb, null, null, pg_temp.uid(6101), pg_temp.hash(6101));
    raise exception 'STALE_STAGE_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'STALE_STAGE_VERSION' then raise exception 'STALE_STAGE_WRONG:%', sqlerrm; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Legal-transition guard: illegal command for current status -> invalid
--    transition; skipping a non-skippable stage -> STAGE_SKIP_FORBIDDEN.
-- ---------------------------------------------------------------------------
do $$
declare v_reg_id uuid; v_stage_id uuid; v_reg_ver bigint; v_stage_ver bigint;
begin
  select r.id, s.id, r.version, s.version
    into v_reg_id, v_stage_id, v_reg_ver, v_stage_ver
  from public.company_registrations r
  join public.registration_stages s
    on s.registration_id = r.id and s.code = r.current_stage
  where r.company_id = pg_temp.uid(301);

  -- current stage (application_submitted) is in_progress; 'complete' with no
  -- linked evidence violates the requirements guard for stage 1.
  begin
    perform public.transition_registration_stage(pg_temp.uid(9), 'aal1', pg_temp.uid(300), pg_temp.uid(301),
      v_reg_id, v_stage_id, 'complete', v_reg_ver, v_stage_ver,
      jsonb_build_object('applicationSubmittedOn', to_char(current_date,'YYYY-MM-DD')),
      null, null, pg_temp.uid(6200), pg_temp.hash(6200));
    raise exception 'REQS_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'STAGE_REQUIREMENTS_INCOMPLETE' then raise exception 'REQS_WRONG:%', sqlerrm; end if;
  end;

  -- 'start' on an already in_progress stage -> INVALID_STAGE_TRANSITION.
  begin
    perform public.transition_registration_stage(pg_temp.uid(9), 'aal1', pg_temp.uid(300), pg_temp.uid(301),
      v_reg_id, v_stage_id, 'start', v_reg_ver, v_stage_ver, '{}'::jsonb, null, null,
      pg_temp.uid(6201), pg_temp.hash(6201));
    raise exception 'INVALID_TRANS_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INVALID_STAGE_TRANSITION' then raise exception 'INVALID_TRANS_WRONG:%', sqlerrm; end if;
  end;

  -- skip application_submitted (not skippable) -> STAGE_SKIP_FORBIDDEN.
  begin
    perform public.transition_registration_stage(pg_temp.uid(9), 'aal1', pg_temp.uid(300), pg_temp.uid(301),
      v_reg_id, v_stage_id, 'skip', v_reg_ver, v_stage_ver, '{}'::jsonb,
      'NOT_APPLICABLE', 'Synthetic skip reason', pg_temp.uid(6202), pg_temp.hash(6202));
    raise exception 'SKIP_NOT_RAISED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'STAGE_SKIP_FORBIDDEN' then raise exception 'SKIP_WRONG:%', sqlerrm; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Authorization fail-closed.
-- ---------------------------------------------------------------------------
do $$
declare v_reg_id uuid;
begin
  select id into v_reg_id from public.company_registrations where company_id = pg_temp.uid(101);

  -- pro of tenant B calling against company A -> FORBIDDEN (42501).
  begin
    perform public.read_pro_registration_workflow(pg_temp.uid(6), pg_temp.uid(100), pg_temp.uid(101), v_reg_id);
    raise exception 'FOREIGN_PRO_NOT_BLOCKED';
  exception when sqlstate '42501' then null; end;

  -- customer calling a mutation (create) -> FORBIDDEN (authorize_pro fails).
  begin
    perform public.create_company_registration(pg_temp.uid(3), pg_temp.uid(100), pg_temp.uid(101),
      'X', 'normal', null, pg_temp.uid(6300), pg_temp.hash(6300));
    raise exception 'CUSTOMER_MUTATION_NOT_BLOCKED';
  exception when sqlstate '42501' then null; end;

  -- operator read without aal2 -> FORBIDDEN (fail closed).
  begin
    perform public.read_operator_registration_workflow(pg_temp.uid(1), 'aal1', v_reg_id);
    raise exception 'OPERATOR_AAL1_NOT_BLOCKED';
  exception when sqlstate '42501' then null; end;

  -- admin without MFA even at aal2 -> FORBIDDEN.
  begin
    perform public.read_operator_registration_workflow(pg_temp.uid(8), 'aal2', v_reg_id);
    raise exception 'OPERATOR_NOMFA_NOT_BLOCKED';
  exception when sqlstate '42501' then null; end;

  -- guessed/nonexistent registration id: no existence disclosure. PRO with
  -- valid company access but bogus reg id -> REGISTRATION_NOT_FOUND (error, not data).
  begin
    perform public.read_pro_registration_workflow(pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101),
      pg_temp.uid(999999));
    raise exception 'BOGUS_REG_RETURNED_DATA';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REGISTRATION_NOT_FOUND' then raise exception 'BOGUS_REG_WRONG:%', sqlerrm; end if;
  end;

  -- customer of tenant B reading tenant A's registration -> FORBIDDEN.
  begin
    perform public.read_customer_registration_progress(pg_temp.uid(7), v_reg_id);
    raise exception 'FOREIGN_CUSTOMER_NOT_BLOCKED';
  exception when sqlstate '42501' then null; end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7b. RLS read policies (authenticated principals): scope resolves from live
--     DB state via auth.uid(), never JWT claims. Assigned PRO sees the row;
--     an employee sees only their own visa person; foreign principals see none.
-- ---------------------------------------------------------------------------
do $$
declare v_reg_id uuid;
begin
  select id into v_reg_id from public.company_registrations where company_id = pg_temp.uid(101);

  -- assigned PRO can SELECT the registration row under RLS.
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.uid(2),
    'app_metadata', jsonb_build_object('role','pro','tenant_id',pg_temp.uid(100)))::text, true);
  perform pg_temp.check((select count(*) = 1 from public.company_registrations where id = v_reg_id),
    'RLS_PRO_SEES_ROW');
  reset role;

  -- foreign PRO (tenant B) sees nothing.
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.uid(6),
    'app_metadata', jsonb_build_object('role','pro','tenant_id',pg_temp.uid(200)))::text, true);
  perform pg_temp.check((select count(*) = 0 from public.company_registrations where id = v_reg_id),
    'RLS_FOREIGN_PRO_BLIND');
  reset role;

  -- employee sees only their own visa person row (none created for this reg's
  -- shareholder-only person -> zero visible rows for the employee).
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.uid(4),
    'app_metadata', jsonb_build_object('role','employee','tenant_id',pg_temp.uid(100)))::text, true);
  perform pg_temp.check((select count(*) = 0 from public.registration_visa_people
    where registration_id = v_reg_id), 'RLS_EMPLOYEE_SELF_ONLY');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Immutability: direct UPDATE/DELETE on the event tables raises the
--    immutability trigger error (REGISTRATION_EVENT_IMMUTABLE, P0001).
-- ---------------------------------------------------------------------------
do $$
declare v_reg_id uuid; v_stage_event_id uuid; v_visa_event_id uuid;
begin
  select id into v_reg_id from public.company_registrations where company_id = pg_temp.uid(101);
  select id into v_stage_event_id from public.registration_stage_events
    where registration_id = v_reg_id limit 1;
  select id into v_visa_event_id from public.registration_visa_events
    where registration_id = v_reg_id limit 1;

  begin
    update public.registration_stage_events set reason_text = 'mutated' where id = v_stage_event_id;
    raise exception 'STAGE_EVENT_UPDATE_NOT_FENCED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REGISTRATION_EVENT_IMMUTABLE' then raise exception 'STAGE_EVENT_WRONG:%', sqlerrm; end if;
  end;
  begin
    delete from public.registration_stage_events where id = v_stage_event_id;
    raise exception 'STAGE_EVENT_DELETE_NOT_FENCED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REGISTRATION_EVENT_IMMUTABLE' then raise exception 'STAGE_EVENT_DEL_WRONG:%', sqlerrm; end if;
  end;
  begin
    update public.registration_visa_events set reason_text = 'mutated' where id = v_visa_event_id;
    raise exception 'VISA_EVENT_UPDATE_NOT_FENCED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REGISTRATION_EVENT_IMMUTABLE' then raise exception 'VISA_EVENT_WRONG:%', sqlerrm; end if;
  end;
  begin
    delete from public.registration_visa_events where id = v_visa_event_id;
    raise exception 'VISA_EVENT_DELETE_NOT_FENCED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REGISTRATION_EVENT_IMMUTABLE' then raise exception 'VISA_EVENT_DEL_WRONG:%', sqlerrm; end if;
  end;
end;
$$;

-- 8b. Invoke (not just grant-check) the admin index + active-registration
--     resolver and assert their exact return contracts.
do $$
declare
  v_reg_id uuid;
  v_index jsonb;
  v_row jsonb;
  v_key text;
  v_resolved uuid;
begin
  select id into v_reg_id from public.company_registrations where company_id = pg_temp.uid(101);

  v_index := public.read_admin_registration_index(pg_temp.uid(1), 'aal2', null, null, null, null, 1);
  perform pg_temp.check((v_index->>'total')::integer >= 1, 'ADMIN_INDEX_TOTAL');
  select item into v_row from jsonb_array_elements(v_index->'items') item
    where item->>'registrationId' = v_reg_id::text;
  perform pg_temp.check(v_row is not null, 'ADMIN_INDEX_ROW_MISSING');
  foreach v_key in array array[
    'registrationId','tenantId','companyId','companyName','proName','title','status',
    'currentStage','currentStageStatus','completedStages','totalStages',
    'registrationVersion','updatedAt'
  ] loop
    perform pg_temp.check(v_row ? v_key, 'ADMIN_INDEX_KEY_MISSING:' || v_key);
  end loop;
  perform pg_temp.check(v_row->>'tenantId' = pg_temp.uid(100)::text, 'ADMIN_INDEX_TENANT');
  perform pg_temp.check(v_row->>'companyName' = 'Synthetic Co A', 'ADMIN_INDEX_COMPANY_NAME');
  perform pg_temp.check((v_row->>'totalStages')::integer = 7, 'ADMIN_INDEX_TOTAL_STAGES');
  perform pg_temp.check(
    (v_row->>'completedStages')::integer = (
      select count(*) from public.registration_stages
      where registration_id = v_reg_id and status in ('completed', 'skipped')
    ),
    'ADMIN_INDEX_COMPLETED_STAGES'
  );
  perform pg_temp.check(
    (v_row->>'registrationVersion')::bigint =
      (select version from public.company_registrations where id = v_reg_id),
    'ADMIN_INDEX_VERSION'
  );

  -- The status filter is the current-stage status (the page's filter domain).
  v_index := public.read_admin_registration_index(
    pg_temp.uid(1), 'aal2', pg_temp.uid(101)::text, null, null, v_row->>'currentStageStatus', 1
  );
  perform pg_temp.check((v_index->>'total')::integer = 1, 'ADMIN_INDEX_STATUS_FILTER_MATCH');
  foreach v_key in array array['not_started', 'in_progress', 'blocked', 'completed', 'skipped'] loop
    v_index := public.read_admin_registration_index(pg_temp.uid(1), 'aal2', null, null, null, v_key, 1);
    perform pg_temp.check(v_index ? 'total', 'ADMIN_INDEX_STATUS_FILTER:' || v_key);
  end loop;
  v_index := public.read_admin_registration_index(
    pg_temp.uid(1), 'aal2', pg_temp.uid(999)::text, null, null, null, 1
  );
  perform pg_temp.check((v_index->>'total')::integer = 0
    and jsonb_array_length(v_index->'items') = 0, 'ADMIN_INDEX_EMPTY_FILTER');
  begin
    perform public.read_admin_registration_index(pg_temp.uid(1), 'aal2', null, null, null, 'draft', 1);
    raise exception 'ADMIN_INDEX_REGISTRATION_STATUS_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;

  -- Resolver returns the bare registration uuid for in-scope roles.
  v_resolved := public.resolve_company_active_registration(
    pg_temp.uid(2), pg_temp.uid(100), pg_temp.uid(101), 'pro');
  perform pg_temp.check(v_resolved = v_reg_id, 'RESOLVE_PRO');
  v_resolved := public.resolve_company_active_registration(
    pg_temp.uid(3), pg_temp.uid(100), pg_temp.uid(101), 'customer');
  perform pg_temp.check(v_resolved = v_reg_id, 'RESOLVE_CUSTOMER');
end;
$$;

-- 8c. Operator (admin/super_admin, MFA, aal2) mutation authority on an isolated
--     tenant D: success paths, actor_category, audit source, replay, and the
--     fail-closed matrix.
insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'reg-visa-' || n || '@example.invalid',
  '', now(), '{}', '{}', now(), now() from generate_series(10, 12) n;
insert into public.tenants(id, slug, name, status) values
  (pg_temp.uid(400), 'reg-visa-d', 'Synthetic Tenant D', 'active');
insert into public.profiles(id, tenant_id, role, status, mfa_enrolled_at) values
  (pg_temp.uid(10), null,             'super_admin', 'active',   now()),
  (pg_temp.uid(11), pg_temp.uid(400), 'pro',         'active',   null),
  (pg_temp.uid(12), null,             'admin',       'disabled', now());
insert into public.company_profiles(
  id, tenant_id, company_name, status,
  licensing_authority, jurisdiction_type, legal_structure,
  trade_license_no, license_expiry) values
  (pg_temp.uid(401), pg_temp.uid(400), 'Synthetic Co D', 'active',
    'DED', 'mainland', 'llc', 'CN-4001', current_date + 365);
insert into public.pro_profiles(profile_id) values (pg_temp.uid(11));
insert into public.pro_credentials(id, pro_profile_id, credential_type,
  identifier_ciphertext, identifier_hash, identifier_last4, issuing_authority,
  issue_date, expiry_date, state, version, submitted_at, created_by) values
  (pg_temp.uid(410), pg_temp.uid(11), 'pro_license', 'synthetic', repeat('d',64),
    'DD41', 'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1));
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by) values
  (pg_temp.uid(411), pg_temp.uid(400), pg_temp.uid(401), pg_temp.uid(11), pg_temp.uid(1));
insert into public.documents(id, tenant_id, company_id, doc_type, label) values
  (pg_temp.uid(470), pg_temp.uid(400), pg_temp.uid(401), 'other', 'Application Form D');
insert into public.document_versions(
  id, document_id, tenant_id, storage_path, mime_type, size_bytes, sha256,
  upload_operation_id, review_status) values
  (pg_temp.uid(471), pg_temp.uid(470), pg_temp.uid(400),
    pg_temp.uid(400)::text||'/'||pg_temp.uid(401)::text||'/documents/seed/'||pg_temp.uid(471)::text||'.pdf',
    'application/pdf', 8, repeat('e',64), null, 'pending');
update public.document_versions set review_status = 'approved', reviewed_by = pg_temp.uid(1), reviewed_at = now()
  where id = pg_temp.uid(471);

do $$
declare
  v_reg jsonb;
  v_reg_id uuid;
  v_stage_id uuid;
  v_reg_ver bigint;
  v_stage_ver bigint;
  v_link jsonb;
  v_first jsonb;
  v_again jsonb;
  v_audit_before integer;
  v_case record;
begin
  -- Create stays PRO-only.
  begin
    perform public.create_company_registration(
      pg_temp.uid(10), pg_temp.uid(400), pg_temp.uid(401), 'Operator create attempt',
      'normal', null, pg_temp.uid(8001), pg_temp.hash(8001));
    raise exception 'OPERATOR_CREATE_ALLOWED';
  exception when sqlstate '42501' then null;
  end;
  v_reg := public.create_company_registration(
    pg_temp.uid(11), pg_temp.uid(400), pg_temp.uid(401), 'Tenant D registration',
    'normal', null, pg_temp.uid(8002), pg_temp.hash(8002));
  v_reg_id := (v_reg->>'registrationId')::uuid;
  perform pg_temp.check((select actor_category from public.registration_stage_events
    where operation_id = pg_temp.uid(8002)) = 'pro', 'CREATE_EVENT_CATEGORY');
  select id, version into v_stage_id, v_stage_ver from public.registration_stages
    where registration_id = v_reg_id and code = 'application_submitted';
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;

  -- Fail-closed matrix: every one of these must raise 42501 FORBIDDEN.
  for v_case in
    select * from (values
      (pg_temp.uid(10), 'aal1', pg_temp.uid(400), pg_temp.uid(401), 'OPERATOR_AAL1'),
      (pg_temp.uid(8),  'aal2', pg_temp.uid(400), pg_temp.uid(401), 'OPERATOR_NO_MFA'),
      (pg_temp.uid(12), 'aal2', pg_temp.uid(400), pg_temp.uid(401), 'OPERATOR_DISABLED'),
      (pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(101), 'OPERATOR_MISMATCHED_PAIR'),
      (pg_temp.uid(3),  'aal2', pg_temp.uid(400), pg_temp.uid(401), 'CUSTOMER_ACTOR'),
      (pg_temp.uid(4),  'aal2', pg_temp.uid(400), pg_temp.uid(401), 'EMPLOYEE_ACTOR'),
      (pg_temp.uid(2),  'aal2', pg_temp.uid(400), pg_temp.uid(401), 'FOREIGN_PRO')
    ) as t(actor, aal, tenant, company, label)
  loop
    begin
      perform public.transition_registration_stage(
        v_case.actor, v_case.aal, v_case.tenant, v_case.company, v_reg_id, v_stage_id,
        'block', v_reg_ver, v_stage_ver, '{}'::jsonb, 'AUTHORITY_DELAY', 'Denied attempt',
        pg_temp.uid(8003), pg_temp.hash(8003));
      raise exception 'NOT_FENCED:%', v_case.label;
    exception when sqlstate '42501' then
      if sqlerrm <> 'FORBIDDEN' then raise exception 'WRONG_DENIAL:%:%', v_case.label, sqlerrm; end if;
    end;
  end loop;

  -- PRO may not use the operator-only recovery reason.
  begin
    perform public.transition_registration_stage(
      pg_temp.uid(11), 'aal1', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
      'recover', v_reg_ver, v_stage_ver, '{}'::jsonb, 'OPERATOR_RECOVERY', 'PRO attempt',
      pg_temp.uid(8004), pg_temp.hash(8004));
    raise exception 'PRO_USED_OPERATOR_RECOVERY';
  exception when sqlstate '22023' then
    if sqlerrm <> 'INVALID_STAGE_REASON' then raise exception 'PRO_REASON_WRONG:%', sqlerrm; end if;
  end;

  -- Operator block: succeeds without any PRO assignment, event + audit attributed.
  select pg_catalog.count(*) into v_audit_before from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin';
  v_first := public.transition_registration_stage(
    pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
    'block', v_reg_ver, v_stage_ver, '{}'::jsonb, 'AUTHORITY_DELAY', 'Operator block',
    pg_temp.uid(8005), pg_temp.hash(8005));
  perform pg_temp.check((select actor_category from public.registration_stage_events
    where operation_id = pg_temp.uid(8005)) = 'operator', 'OPERATOR_STAGE_EVENT_CATEGORY');
  perform pg_temp.check((select pg_catalog.count(*) from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin') = v_audit_before + 1,
    'OPERATOR_STAGE_AUDIT_ONCE');

  -- Exact replay returns the stored receipt and writes no second audit row.
  v_again := public.transition_registration_stage(
    pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
    'block', v_reg_ver, v_stage_ver, '{}'::jsonb, 'AUTHORITY_DELAY', 'Operator block',
    pg_temp.uid(8005), pg_temp.hash(8005));
  perform pg_temp.check(v_again = v_first, 'OPERATOR_REPLAY_RECEIPT');
  perform pg_temp.check((select pg_catalog.count(*) from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin') = v_audit_before + 1,
    'OPERATOR_REPLAY_NO_AUDIT');
  begin
    perform public.transition_registration_stage(
      pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
      'block', v_reg_ver, v_stage_ver, '{}'::jsonb, 'AUTHORITY_DELAY', 'Operator block',
      pg_temp.uid(8005), pg_temp.hash(8999));
    raise exception 'OPERATOR_CHANGED_REPLAY_ALLOWED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'OPERATION_REUSED' then raise exception 'REPLAY_WRONG:%', sqlerrm; end if;
  end;

  -- PRO unblock after the operator block: category 'pro', audit stays self_serve.
  select version into v_reg_ver from public.company_registrations where id = v_reg_id;
  select version into v_stage_ver from public.registration_stages where id = v_stage_id;
  perform public.transition_registration_stage(
    pg_temp.uid(11), 'aal1', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
    'unblock', v_reg_ver, v_stage_ver, '{}'::jsonb, 'AUTHORITY_RESUMED', 'PRO resumes',
    pg_temp.uid(8006), pg_temp.hash(8006));
  perform pg_temp.check((select actor_category from public.registration_stage_events
    where operation_id = pg_temp.uid(8006)) = 'pro', 'PRO_STAGE_EVENT_CATEGORY');
  perform pg_temp.check((select pg_catalog.count(*) from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin') = v_audit_before + 1,
    'PRO_AUDIT_NOT_ADMIN');

  -- Operator link then unlink evidence; each writes exactly one admin audit row.
  v_link := public.link_registration_stage_document(
    pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
    pg_temp.uid(470), pg_temp.uid(471), 'application_form',
    pg_temp.uid(8007), pg_temp.hash(8007));
  perform pg_temp.check((select pg_catalog.count(*) from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin') = v_audit_before + 2,
    'OPERATOR_LINK_AUDIT');
  perform public.unlink_registration_stage_document(
    pg_temp.uid(10), 'aal2', pg_temp.uid(400), pg_temp.uid(401), v_reg_id, v_stage_id,
    (v_link->>'linkId')::uuid, pg_temp.uid(8008), pg_temp.hash(8008));
  perform pg_temp.check((select pg_catalog.count(*) from public.tenant_audit_log
    where tenant_id = pg_temp.uid(400) and source = 'admin') = v_audit_before + 3,
    'OPERATOR_UNLINK_AUDIT');
end;
$$;

-- 9. Final marker.
select 'REGISTRATION_VISA_ASSERTIONS_PASSED' as assertion;
rollback;
