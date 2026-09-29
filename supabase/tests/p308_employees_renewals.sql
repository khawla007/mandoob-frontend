\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
set statement_timeout = '60s';
begin;

-- Rollback-only P3.08 proof: grants, authority, replay, versions, history,
-- import batches/leases/cancel/release, renewal stages/evidence/reminders,
-- Dubai dates and materialization. Synthetic data only.
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('93080000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.h(t text) returns text language sql immutable as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex');
$$;
create temp table assertions(label text primary key);
grant all on pg_temp.assertions to service_role, authenticated;
create temp table results(k text primary key, v jsonb);
grant all on pg_temp.results to service_role;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'ASSERTION_FAILED %', label; end if;
  insert into pg_temp.assertions values (label);
end;
$$;
-- Runs SQL as service_role and asserts the raised message.
create function pg_temp.expect_error(p_sql text, p_message text, p_label text) returns void
language plpgsql as $$
declare v_message text;
begin
  begin
    execute 'set local role service_role';
    execute p_sql;
    execute 'reset role';
    raise exception using errcode = 'ZT001', message = 'UNEXPECTED_SUCCESS ' || p_label;
  exception
    when sqlstate 'ZT001' then raise;
    when others then
      get stacked diagnostics v_message = message_text;
      execute 'reset role';
      if v_message <> p_message then
        raise exception 'WRONG_ERROR % expected % got %', p_label, p_message, v_message;
      end if;
  end;
  insert into pg_temp.assertions values (p_label);
end;
$$;
grant execute on function pg_temp.uid(integer), pg_temp.h(text) to service_role;

-- Fixture ------------------------------------------------------------------
insert into public.tenants(id, slug, name) values
  (pg_temp.uid(100), 'p308-fixture-a', 'Synthetic A'),
  (pg_temp.uid(200), 'p308-fixture-b', 'Synthetic B');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'p308-' || n || '@example.invalid', '', now(), '{}', '{}', now(), now()
from generate_series(1, 9) n;
insert into public.profiles(id, tenant_id, role, status) values
  (pg_temp.uid(1), null, 'pro', 'active'),
  (pg_temp.uid(2), null, 'pro', 'active'),
  (pg_temp.uid(3), null, 'pro', 'disabled'),
  (pg_temp.uid(4), pg_temp.uid(100), 'customer', 'active'),
  (pg_temp.uid(5), pg_temp.uid(100), 'employee', 'active'),
  (pg_temp.uid(6), pg_temp.uid(100), 'employee', 'active'),
  (pg_temp.uid(7), null, 'admin', 'active'),
  (pg_temp.uid(8), pg_temp.uid(200), 'employee', 'active');
insert into public.pro_profiles(profile_id) values (pg_temp.uid(1)), (pg_temp.uid(2)), (pg_temp.uid(3));
insert into public.pro_credentials(id, pro_profile_id, identifier_ciphertext, identifier_hash,
  identifier_last4, issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by)
select pg_temp.uid(30 + n), pg_temp.uid(n), 'synthetic', pg_temp.h('cred' || n), '999' || n,
  'Synthetic Authority', current_date - 1, current_date + 365, 'verified', 2, now(), pg_temp.uid(n)
from generate_series(1, 3) n;
insert into public.company_profiles(id, tenant_id, company_name) values
  (pg_temp.uid(101), pg_temp.uid(100), 'Synthetic A'),
  (pg_temp.uid(201), pg_temp.uid(200), 'Synthetic B');
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by) values
  (pg_temp.uid(11), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(1), pg_temp.uid(7)),
  (pg_temp.uid(12), pg_temp.uid(200), pg_temp.uid(201), pg_temp.uid(2), pg_temp.uid(7));
insert into public.customer_profiles(profile_id, linked_company_id) values (pg_temp.uid(4), pg_temp.uid(101));
insert into public.employees(id, tenant_id, company_id, profile_id, name) values
  (pg_temp.uid(51), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(5), 'Self Employee'),
  (pg_temp.uid(52), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(6), 'Other Employee'),
  (pg_temp.uid(53), pg_temp.uid(200), pg_temp.uid(201), pg_temp.uid(8), 'Foreign Employee');

create function pg_temp.emp(p_name text, p_passport text) returns jsonb language sql immutable as $$
  select jsonb_build_object('name', p_name, 'email', replace(lower(p_name), ' ', '.') || '@example.invalid',
    'passport_no_encrypted', 'cipher:' || p_passport, 'passport_no_hash', pg_temp.h(p_passport),
    'passport_no_last4', right(p_passport, 4), 'visa_expiry', '2027-06-30');
$$;
grant execute on function pg_temp.emp(text, text) to service_role;

-- 1. Grants ------------------------------------------------------------------
do $$
declare v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure::text as sig, n.nspname as schema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'p308\_%' or (n.nspname = 'public' and p.proname = 'recompute_renewal_status')
  loop
    if has_function_privilege('anon', v_fn.sig, 'execute')
      or has_function_privilege('authenticated', v_fn.sig, 'execute') then
      raise exception 'P308_GRANT_LEAK %', v_fn.sig;
    end if;
    if v_fn.schema = 'public' and v_fn.sig not like '%recompute%'
      and not has_function_privilege('service_role', v_fn.sig, 'execute') then
      raise exception 'P308_SERVICE_ROLE_MISSING %', v_fn.sig;
    end if;
    if v_fn.schema = 'private' and has_function_privilege('service_role', v_fn.sig, 'execute') then
      raise exception 'P308_PRIVATE_GRANT %', v_fn.sig;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.employee_audit_events', 'select')
    or has_table_privilege('authenticated', 'public.renewal_stage_events', 'select')
    or has_table_privilege('authenticated', 'public.renewals', 'insert')
    or has_table_privilege('service_role', 'public.renewals', 'update')
    or has_table_privilege('service_role', 'public.bulk_import_jobs', 'insert')
    or has_table_privilege('service_role', 'public.renewal_stage_events', 'insert')
  then
    raise exception 'P308_TABLE_GRANT_LEAK';
  end if;
end;
$$;
select pg_temp.check(true, 'GRANTS_SERVICE_ROLE_ONLY');

-- 2. Employee create / replay / authority --------------------------------------
set local role service_role;
insert into pg_temp.results select 'create1', public.p308_create_employee(
  pg_temp.uid(1), pg_temp.uid(901), pg_temp.h('c1'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Alpha', 'P1234567'));
insert into pg_temp.results select 'create1_replay', public.p308_create_employee(
  pg_temp.uid(1), pg_temp.uid(901), pg_temp.h('c1'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Alpha', 'P1234567'));
reset role;
select pg_temp.check(
  (select v->>'replayed' = 'false' and (v->>'version')::int = 1 from pg_temp.results where k = 'create1')
  and (select v->>'replayed' = 'true' from pg_temp.results where k = 'create1_replay')
  and (select (a.v->>'employee_id') = (b.v->>'employee_id') from pg_temp.results a, pg_temp.results b
       where a.k = 'create1' and b.k = 'create1_replay')
  and (select count(*) = 1 from public.employees where name = 'Alpha')
  and (select count(*) = 1 from public.employee_audit_events e join pg_temp.results r
       on r.k = 'create1' and e.employee_id = (r.v->>'employee_id')::uuid)
  and (select count(*) = 1 from public.tenant_audit_log where details->>'entity' = 'employee'
       and details->>'operation_id' = pg_temp.uid(901)::text)
  and (select count(*) = 1 from public.domain_events where event_type = 'employee.record.changed'
       and payload->>'operation_id' = pg_temp.uid(901)::text),
  'EMPLOYEE_CREATE_REPLAY_AUDIT_EVENT');
select pg_temp.check(
  (select count(*) = 0 from public.domain_events where event_type like 'employee.%'
     and (payload::text ilike '%P1234567%' or payload::text ilike '%cipher%' or payload::text ilike '%example.invalid%')),
  'EMPLOYEE_EVENT_REFERENCE_ONLY');

select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(901), pg_temp.h('changed'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Alpha', 'P1234567')), 'OPERATION_REUSED', 'CHANGED_REPLAY_REJECTED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(902), pg_temp.h('c2'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Alpha Twin', 'P1234567')), 'EMPLOYEE_PASSPORT_DUPLICATE', 'PASSPORT_UNIQUE');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(2), pg_temp.uid(903), pg_temp.h('c3'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Cross', 'X0000001')), 'FORBIDDEN', 'CROSS_COMPANY_PRO_DENIED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(3), pg_temp.uid(904), pg_temp.h('c4'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Inactive', 'X0000002')), 'FORBIDDEN', 'INACTIVE_PRO_DENIED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(4), pg_temp.uid(905), pg_temp.h('c5'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Customer', 'X0000003')), 'FORBIDDEN', 'CUSTOMER_WRITE_DENIED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(5), pg_temp.uid(906), pg_temp.h('c6'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('Employee', 'X0000004')), 'FORBIDDEN', 'EMPLOYEE_WRITE_DENIED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(907), pg_temp.h('c7'), pg_temp.uid(200), pg_temp.uid(201),
  pg_temp.emp('Guessed', 'X0000005')), 'FORBIDDEN', 'GUESSED_TENANT_DENIED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(908), pg_temp.h('c8'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('name', 'Plain', 'passport_no', 'P999')), 'INVALID_EMPLOYEE_PAYLOAD', 'PLAINTEXT_IDENTIFIER_REJECTED');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(909), pg_temp.h('c9'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('name', 'Half', 'passport_no_encrypted', 'cipher')), 'INVALID_EMPLOYEE_PAYLOAD', 'IDENTIFIER_TRIPLE_REQUIRED');

-- 3. Update / versions / status ------------------------------------------------
select pg_temp.expect_error(format($q$select public.p308_update_employee(%L,%L,%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(910), pg_temp.h('u0'), pg_temp.uid(100), pg_temp.uid(101),
  (select v->>'employee_id' from pg_temp.results where k = 'create1'), 7,
  '{"job_title":"Engineer"}'), 'STALE_VERSION', 'EMPLOYEE_STALE_VERSION');
select pg_temp.expect_error(format($q$select public.p308_update_employee(%L,%L,%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(911), pg_temp.h('u1'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.uid(53), 1, '{"job_title":"Engineer"}'), 'EMPLOYEE_NOT_FOUND', 'FOREIGN_EMPLOYEE_ID_NOT_FOUND');
set local role service_role;
insert into pg_temp.results select 'update1', public.p308_update_employee(
  pg_temp.uid(1), pg_temp.uid(912), pg_temp.h('u2'), pg_temp.uid(100), pg_temp.uid(101),
  (select (v->>'employee_id')::uuid from pg_temp.results where k = 'create1'), 1,
  '{"job_title":"Engineer","phone":"+971 50 000 0000"}');
insert into pg_temp.results select 'status1', public.p308_set_employee_status(
  pg_temp.uid(1), pg_temp.uid(913), pg_temp.h('s1'), pg_temp.uid(100), pg_temp.uid(101),
  (select (v->>'employee_id')::uuid from pg_temp.results where k = 'create1'), 2, 'inactive');
reset role;
select pg_temp.check(
  (select (v->>'version')::int = 2 from pg_temp.results where k = 'update1')
  and (select (v->>'version')::int = 3 from pg_temp.results where k = 'status1')
  and (select status::text = 'inactive' and deactivated_at is not null and job_title = 'Engineer'
       from public.employees where id = (select (v->>'employee_id')::uuid from pg_temp.results where k = 'create1'))
  and (select array_agg(action order by version) = array['created','updated','deactivated']
       from public.employee_audit_events where employee_id = (select (v->>'employee_id')::uuid from pg_temp.results where k = 'create1')),
  'EMPLOYEE_UPDATE_STATUS_HISTORY');
select pg_temp.expect_error(format($q$select public.p308_set_employee_status(%L,%L,%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(914), pg_temp.h('s2'), pg_temp.uid(100), pg_temp.uid(101),
  (select v->>'employee_id' from pg_temp.results where k = 'create1'), 3, 'inactive'),
  'EMPLOYEE_STATUS_UNCHANGED', 'STATUS_UNCHANGED_REJECTED');
do $$ begin
  begin
    update public.employee_audit_events set action = 'updated';
    raise exception 'AUDIT_MUTABLE';
  exception when sqlstate '55000' then null;
  end;
end $$;
select pg_temp.check(true, 'EMPLOYEE_HISTORY_IMMUTABLE');

-- Out-of-band admin identity edits still bump the version fence.
update public.employees set email = 'admin-edit@example.invalid' where id = pg_temp.uid(52);
select pg_temp.check((select version = 2 from public.employees where id = pg_temp.uid(52)), 'LEGACY_WRITE_BUMPS_VERSION');

-- 4. Employee self-service ------------------------------------------------------
set local role service_role;
insert into pg_temp.results select 'self1', public.p308_update_employee_self(
  pg_temp.uid(5), pg_temp.uid(920), pg_temp.h('self1'), pg_temp.uid(100), 1,
  '{"phone":"+971 55 111 2222","renewal_reminders_enabled":false}');
reset role;
select pg_temp.check(
  (select (v->>'employee_id')::uuid = pg_temp.uid(51) and (v->>'version')::int = 2 from pg_temp.results where k = 'self1')
  and (select renewal_reminders_enabled = false from public.employee_notification_preferences where employee_id = pg_temp.uid(51))
  and (select phone = '+971 55 111 2222' from public.employees where id = pg_temp.uid(51)),
  'EMPLOYEE_SELF_UPDATE');
select pg_temp.expect_error(format($q$select public.p308_update_employee_self(%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(5), pg_temp.uid(921), pg_temp.h('self2'), pg_temp.uid(100), 1, '{"phone":"+971 55 111 3333"}'),
  'STALE_VERSION', 'SELF_STALE_VERSION');
select pg_temp.expect_error(format($q$select public.p308_update_employee_self(%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(5), pg_temp.uid(922), pg_temp.h('self3'), pg_temp.uid(100), 2, '{"name":"Renamed"}'),
  'INVALID_EMPLOYEE_PAYLOAD', 'SELF_FIELD_ALLOWLIST');
select pg_temp.expect_error(format($q$select public.p308_update_employee_self(%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(923), pg_temp.h('self4'), pg_temp.uid(100), 1, '{"phone":"+971 55 111 4444"}'),
  'FORBIDDEN', 'SELF_WRONG_ROLE_DENIED');
select pg_temp.expect_error(format($q$select public.p308_update_employee_self(%L,%L,%L,%L,%s,%L)$q$,
  pg_temp.uid(8), pg_temp.uid(924), pg_temp.h('self5'), pg_temp.uid(100), 1, '{"phone":"+971 55 111 4444"}'),
  'FORBIDDEN', 'SELF_CROSS_TENANT_DENIED');

-- 5. Imports ----------------------------------------------------------------------
create function pg_temp.path(job integer) returns text language sql immutable as $$
  select pg_temp.uid(100)::text || '/' || pg_temp.uid(101)::text || '/' || pg_temp.uid(job)::text || '.csv.enc';
$$;
grant execute on function pg_temp.path(integer) to service_role;
select pg_temp.expect_error(format($q$select public.p308_register_import(%L,%L,%L,%L,%L,%L,%L,%L,%s)$q$,
  pg_temp.uid(1), pg_temp.uid(930), pg_temp.h('i0'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(700),
  'elsewhere/file.csv', pg_temp.h('artifact-1'), 100), 'INVALID_IMPORT_ARTIFACT', 'IMPORT_PATH_OWNERSHIP');
set local role service_role;
insert into pg_temp.results select 'imp1', public.p308_register_import(
  pg_temp.uid(1), pg_temp.uid(931), pg_temp.h('i1'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(700),
  pg_temp.path(700), pg_temp.h('artifact-1'), 100);
reset role;
select pg_temp.expect_error(format($q$select public.p308_register_import(%L,%L,%L,%L,%L,%L,%L,%L,%s)$q$,
  pg_temp.uid(1), pg_temp.uid(932), pg_temp.h('i2'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(701),
  pg_temp.path(701), pg_temp.h('artifact-1'), 100), 'IMPORT_DUPLICATE_ARTIFACT', 'DUPLICATE_UPLOAD_REJECTED');
set local role service_role;
select public.p308_record_import_artifact_access(pg_temp.uid(700), pg_temp.uid(1), null, 'validate', pg_temp.h('artifact-1'));
insert into pg_temp.results select 'val1', public.p308_record_import_validation(
  pg_temp.uid(1), pg_temp.uid(933), pg_temp.h('v1'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(700), 1,
  4, 1, '[{"row_number":2,"field":"passport_no","code":"INVALID_FORMAT"}]');
insert into pg_temp.results select 'exec1', public.p308_request_import_execution(
  pg_temp.uid(1), pg_temp.uid(934), pg_temp.h('e1'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(700), 2);
reset role;
select pg_temp.check(
  (select status::text = 'importing' and version = 3 and requested_by = pg_temp.uid(1)
     from public.bulk_import_jobs where id = pg_temp.uid(700))
  and (select count(*) = 1 from public.event_jobs j join public.bulk_import_jobs b on b.execution_event_id = j.event_id
       where b.id = pg_temp.uid(700) and j.consumer_name = 'p308.employee_import.executor' and j.state = 'pending')
  and (select count(*) = 1 from public.bulk_import_artifact_access where job_id = pg_temp.uid(700) and purpose = 'validate'),
  'IMPORT_EXECUTION_EVENT_IN_TRANSACTION');

create temp table leases(k text primary key, job_id uuid, lease uuid);
grant all on pg_temp.leases to service_role;
set local role service_role;
insert into pg_temp.leases select 'w1', c.job_id, c.lease_token
from public.claim_event_jobs(pg_temp.uid(990), 'p308.employee_import.executor', 10, 60) c;
reset role;

create function pg_temp.batch(rows jsonb, batch_no integer, first_row integer, lease uuid default null)
returns jsonb language sql as $$
  select public.p308_apply_import_batch(pg_temp.uid(700), pg_temp.uid(990),
    coalesce(lease, (select l.lease from pg_temp.leases l where k = 'w1')), batch_no, first_row, rows);
$$;
grant execute on function pg_temp.batch(jsonb, integer, integer, uuid) to service_role;

select pg_temp.expect_error(format($q$select pg_temp.batch(%L, 0, 1, %L)$q$,
  jsonb_build_array(jsonb_build_object('row_number', 1, 'outcome', 'valid', 'employee', pg_temp.emp('Beta', 'B0000001'))),
  pg_temp.uid(999)), 'STALE_IMPORT_LEASE', 'IMPORT_LEASE_FENCE');
set local role service_role;
insert into pg_temp.results select 'b0', pg_temp.batch(jsonb_build_array(
  jsonb_build_object('row_number', 1, 'outcome', 'valid', 'employee', pg_temp.emp('Beta', 'B0000001')),
  jsonb_build_object('row_number', 2, 'outcome', 'invalid', 'error_code', 'INVALID_FORMAT'),
  jsonb_build_object('row_number', 3, 'outcome', 'valid', 'employee', pg_temp.emp('Alpha Again', 'P1234567'))
), 0, 1);
insert into pg_temp.results select 'b0_replay', pg_temp.batch(jsonb_build_array(
  jsonb_build_object('row_number', 1, 'outcome', 'valid', 'employee', pg_temp.emp('Beta', 'B0000001'))), 0, 1);
reset role;
select pg_temp.check(
  (select v->>'state' = 'applied' and (v->>'inserted')::int = 1 and (v->>'skipped')::int = 2 from pg_temp.results where k = 'b0')
  and (select v->>'state' = 'replayed' from pg_temp.results where k = 'b0_replay')
  and (select count(*) = 1 from public.employees where name = 'Beta')
  and (select array_agg(outcome order by row_number) = array['inserted','invalid','duplicate_existing']
       from public.bulk_import_row_outcomes where job_id = pg_temp.uid(700))
  and (select next_row = 3 and next_batch = 1 and inserted_rows = 1 and skipped_rows = 2
       from public.bulk_import_jobs where id = pg_temp.uid(700)),
  'IMPORT_BATCH_ATOMIC_EXACT_OUTCOMES_REPLAY');
select pg_temp.expect_error(format($q$select pg_temp.batch(%L, 3, 4)$q$,
  jsonb_build_array(jsonb_build_object('row_number', 4, 'outcome', 'invalid', 'error_code', 'X_ROW'))),
  'IMPORT_BATCH_OUT_OF_ORDER', 'IMPORT_BATCH_ORDER');
select pg_temp.expect_error(format($q$select pg_temp.batch(%L, 1, 4)$q$,
  jsonb_build_array(jsonb_build_object('row_number', 4, 'outcome', 'valid',
    'employee', jsonb_build_object('name', 'Gamma', 'passport_no', 'PLAIN')))),
  'INVALID_EMPLOYEE_PAYLOAD', 'IMPORT_BATCH_ROLLS_BACK_WHOLE');
select pg_temp.check((select next_row = 3 from public.bulk_import_jobs where id = pg_temp.uid(700)), 'IMPORT_FAILED_BATCH_NO_PARTIAL');

-- Cancel during execution is fenced at the next batch boundary.
set local role service_role;
insert into pg_temp.results select 'cancel1', public.p308_cancel_import(
  pg_temp.uid(1), pg_temp.uid(935), pg_temp.h('x1'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(700),
  (select version from public.bulk_import_jobs where id = pg_temp.uid(700)));
insert into pg_temp.results select 'b1', pg_temp.batch(jsonb_build_array(
  jsonb_build_object('row_number', 4, 'outcome', 'valid', 'employee', pg_temp.emp('Delta', 'D0000001'))), 1, 4);
insert into pg_temp.results select 'fin1', public.p308_finalize_import(pg_temp.uid(700), pg_temp.uid(990),
  (select lease from pg_temp.leases where k = 'w1'), null);
reset role;
select pg_temp.check(
  (select v->>'status' = 'cancel_requested' from pg_temp.results where k = 'cancel1')
  and (select v->>'state' = 'cancel_requested' from pg_temp.results where k = 'b1')
  and (select v->>'state' = 'cancelled' from pg_temp.results where k = 'fin1')
  and (select count(*) = 0 from public.employees where name = 'Delta')
  and (select status::text = 'cancelled' from public.bulk_import_jobs where id = pg_temp.uid(700))
  and (select count(*) = 1 from public.domain_events where event_type = 'employee.import.finished'
       and payload->>'resource_id' = pg_temp.uid(700)::text),
  'IMPORT_CANCEL_FENCED_AT_BATCH');

-- Assignment release fences a second execution.
set local role service_role;
select public.p308_register_import(pg_temp.uid(1), pg_temp.uid(940), pg_temp.h('j1'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(710), pg_temp.path(710), pg_temp.h('artifact-2'), 50);
select public.p308_record_import_validation(pg_temp.uid(1), pg_temp.uid(941), pg_temp.h('j2'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(710), 1, 2, 0, '[]');
select public.p308_request_import_execution(pg_temp.uid(1), pg_temp.uid(942), pg_temp.h('j3'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(710), 2);
insert into pg_temp.leases select 'w2', c.job_id, c.lease_token
from public.claim_event_jobs(pg_temp.uid(991), 'p308.employee_import.executor', 10, 60) c;
reset role;
update public.pro_company_assignments set status = 'released', released_at = now(),
  released_by = pg_temp.uid(7), release_reason = 'fixture release' where id = pg_temp.uid(11);
set local role service_role;
insert into pg_temp.results select 'rel', public.p308_apply_import_batch(pg_temp.uid(710), pg_temp.uid(991),
  (select lease from pg_temp.leases where k = 'w2'), 0, 1, jsonb_build_array(
    jsonb_build_object('row_number', 1, 'outcome', 'valid', 'employee', pg_temp.emp('Epsilon', 'E0000001'))));
reset role;
select pg_temp.check(
  (select v->>'failure_code' = 'ASSIGNMENT_RELEASED' from pg_temp.results where k = 'rel')
  and (select status::text = 'failed' and failure_code = 'ASSIGNMENT_RELEASED' from public.bulk_import_jobs where id = pg_temp.uid(710))
  and (select count(*) = 0 from public.employees where name = 'Epsilon'),
  'IMPORT_ASSIGNMENT_RELEASE_FENCED');
select pg_temp.check(
  (select count(*) = 1 from public.tenant_audit_log where details->>'entity' = 'employee_import'
     and details->>'import_job_id' = pg_temp.uid(710)::text and details->>'state' = 'failed'
     and details->>'failure_code' = 'ASSIGNMENT_RELEASED')
  and (select count(*) = 1 from public.domain_events where event_type = 'employee.import.finished'
     and payload->>'resource_id' = pg_temp.uid(710)::text and payload->>'state' = 'failed'),
  'CR_F4_RELEASE_AUDITED_AND_EVENTED_ONCE');
set local role service_role;
select public.p308_finalize_import(pg_temp.uid(710), pg_temp.uid(991), (select lease from pg_temp.leases where k = 'w2'), null);
reset role;
select pg_temp.check(
  (select count(*) = 1 from public.tenant_audit_log where details->>'entity' = 'employee_import'
     and details->>'import_job_id' = pg_temp.uid(710)::text and details ? 'state'),
  'CR_F4_FINALIZE_AFTER_RELEASE_NO_DUPLICATE_AUDIT');
select pg_temp.expect_error(format($q$select public.p308_create_employee(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(943), pg_temp.h('rel'), pg_temp.uid(100), pg_temp.uid(101),
  pg_temp.emp('After Release', 'R0000001')), 'FORBIDDEN', 'RELEASED_PRO_DENIED');
update public.pro_company_assignments set status = 'active', released_at = null,
  released_by = null, release_reason = null where id = pg_temp.uid(11);

-- Retention cleanup lists only expired terminal artifacts.
update public.bulk_import_jobs set retention_expires_at = now() - interval '1 minute' where id = pg_temp.uid(700);
set local role service_role;
insert into pg_temp.results select 'expired', jsonb_build_object('ids',
  (select jsonb_agg(job_id) from public.p308_list_expired_import_artifacts(10)));
insert into pg_temp.results select 'cleanup', jsonb_build_object('ok',
  public.p308_mark_import_artifact_deleted(pg_temp.uid(700), pg_temp.uid(992)));
reset role;
select pg_temp.check(
  (select v->'ids' = jsonb_build_array(pg_temp.uid(700)) from pg_temp.results where k = 'expired')
  and (select (v->>'ok')::boolean from pg_temp.results where k = 'cleanup')
  and (select artifact_deleted_at is not null from public.bulk_import_jobs where id = pg_temp.uid(700))
  and (select count(*) = 1 from public.bulk_import_artifact_access where job_id = pg_temp.uid(700) and purpose = 'cleanup'),
  'IMPORT_RETENTION_CLEANUP_AUDITED');

-- 6. Renewals -------------------------------------------------------------------
set local role service_role;
insert into pg_temp.results select 'r1', public.p308_create_renewal(
  pg_temp.uid(1), pg_temp.uid(950), pg_temp.h('r1'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('type', 'investor_visa', 'label', 'Investor visa', 'employee_id', pg_temp.uid(51),
    'due_date', (current_date + 120)::text,
    'costs', jsonb_build_object('government_fee_minor', 150000, 'pro_service_fee_minor', 50000, 'currency', 'AED')));
reset role;
create function pg_temp.r1() returns uuid language sql as $$
  select (v->>'renewal_id')::uuid from pg_temp.results where k = 'r1';
$$;
grant execute on function pg_temp.r1() to service_role;
select pg_temp.check(
  (select stage = 'due' and status = 'upcoming' and version = 1 and government_fee_minor = 150000
     and employee_id = pg_temp.uid(51) from public.renewals where id = pg_temp.r1())
  and (select count(*) = 8 from public.renewal_reminder_jobs where renewal_id = pg_temp.r1() and state = 'scheduled')
  and (select bool_and(j.available_at = r.remind_at and j.state = 'pending'
          and j.consumer_name = 'internal.renewal_reminder.delivery')
       from public.renewal_reminder_jobs r join public.event_jobs j on j.id = r.job_id
       where r.renewal_id = pg_temp.r1())
  and (select bool_and(extract(hour from r.remind_at at time zone 'Asia/Dubai') = 8)
       from public.renewal_reminder_jobs r where r.renewal_id = pg_temp.r1()),
  'RENEWAL_CREATE_REMINDERS_08_DUBAI');
select pg_temp.expect_error(format($q$select public.p308_create_renewal(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(951), pg_temp.h('r1dup'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('type', 'investor_visa', 'label', 'Investor visa', 'employee_id', pg_temp.uid(51),
    'due_date', (current_date + 120)::text)), 'RENEWAL_DUPLICATE', 'RENEWAL_DUPLICATE_ACTIVE');
select pg_temp.expect_error(format($q$select public.p308_create_renewal(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(952), pg_temp.h('r1cross'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('type', 'visa', 'label', 'Foreign', 'employee_id', pg_temp.uid(53),
    'due_date', (current_date + 20)::text)), 'EMPLOYEE_NOT_FOUND', 'RENEWAL_CROSS_COMPANY_EMPLOYEE');
select pg_temp.expect_error(format($q$select public.p308_create_renewal(%L,%L,%L,%L,%L,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(953), pg_temp.h('r1cost'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_object('type', 'visa', 'label', 'Bad cost', 'due_date', (current_date + 20)::text,
    'costs', jsonb_build_object('fine_minor', 10.5))), 'INVALID_RENEWAL_COSTS', 'RENEWAL_COST_MINOR_UNITS');

-- Reschedule supersedes the obsolete reminder generation.
set local role service_role;
insert into pg_temp.results select 'r1u', public.p308_update_renewal(
  pg_temp.uid(1), pg_temp.uid(954), pg_temp.h('r1u'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 1,
  jsonb_build_object('due_date', (current_date + 45)::text));
reset role;
select pg_temp.check(
  (select (v->>'version')::int = 2 from pg_temp.results where k = 'r1u')
  and (select count(*) = 8 from public.renewal_reminder_jobs where renewal_id = pg_temp.r1() and renewal_version = 1 and state = 'superseded')
  and (select bool_and(j.state = 'cancelled' and j.last_error_code = 'RENEWAL_REMINDER_SUPERSEDED')
       from public.renewal_reminder_jobs r join public.event_jobs j on j.id = r.job_id
       where r.renewal_id = pg_temp.r1() and r.renewal_version = 1)
  and (select count(*) = 6 from public.renewal_reminder_jobs where renewal_id = pg_temp.r1() and renewal_version = 2 and state = 'scheduled'),
  'RENEWAL_REMINDER_SUPERSESSION');

select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,null,null)$q$,
  pg_temp.uid(1), pg_temp.uid(955), pg_temp.h('t0'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 1, 'in_progress'),
  'STALE_VERSION', 'RENEWAL_STALE_TRANSITION');
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,null,null)$q$,
  pg_temp.uid(1), pg_temp.uid(956), pg_temp.h('t1'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 2, 'completed'),
  'INVALID_RENEWAL_TRANSITION', 'RENEWAL_SKIP_FORBIDDEN');
set local role service_role;
select public.p308_transition_renewal(pg_temp.uid(1), pg_temp.uid(957), pg_temp.h('t2'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.r1(), 2, 'in_progress', null, null);
reset role;
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,null,null)$q$,
  pg_temp.uid(1), pg_temp.uid(958), pg_temp.h('t3'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 3, 'documents_submitted'),
  'RENEWAL_EVIDENCE_REQUIRED', 'RENEWAL_EVIDENCE_REQUIRED');

insert into public.documents(id, tenant_id, company_id, doc_type) values
  (pg_temp.uid(801), pg_temp.uid(100), pg_temp.uid(101), 'visa'),
  (pg_temp.uid(802), pg_temp.uid(200), pg_temp.uid(201), 'visa');
insert into public.document_versions(id, document_id, tenant_id, storage_path, mime_type, size_bytes, sha256, uploaded_by) values
  (pg_temp.uid(811), pg_temp.uid(801), pg_temp.uid(100), 'fixture/visa-a.pdf', 'application/pdf', 8, repeat('c', 64), pg_temp.uid(1)),
  (pg_temp.uid(812), pg_temp.uid(802), pg_temp.uid(200), 'fixture/visa-b.pdf', 'application/pdf', 8, repeat('d', 64), pg_temp.uid(2));
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,%L,null)$q$,
  pg_temp.uid(1), pg_temp.uid(959), pg_temp.h('t4'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 3,
  'documents_submitted', array[pg_temp.uid(802)]), 'RENEWAL_EVIDENCE_NOT_FOUND', 'RENEWAL_CROSS_COMPANY_EVIDENCE');

set local role service_role;
select public.p308_update_renewal(pg_temp.uid(1), pg_temp.uid(960), pg_temp.h('blk'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.r1(), 3, '{"blocker_code":"awaiting_medical"}');
reset role;
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,%L,null)$q$,
  pg_temp.uid(1), pg_temp.uid(961), pg_temp.h('t5'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 4,
  'documents_submitted', array[pg_temp.uid(801)]), 'RENEWAL_BLOCKED', 'RENEWAL_BLOCKER_ENFORCED');
set local role service_role;
select public.p308_update_renewal(pg_temp.uid(1), pg_temp.uid(962), pg_temp.h('unblk'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.r1(), 4, '{"blocker_code":null}');
select public.p308_transition_renewal(pg_temp.uid(1), pg_temp.uid(963), pg_temp.h('t6'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.r1(), 5, 'documents_submitted', array[pg_temp.uid(801)], null);
select public.p308_transition_renewal(pg_temp.uid(1), pg_temp.uid(964), pg_temp.h('t7'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.r1(), 6, 'government_processing', null, null);
insert into pg_temp.results select 'r1done', public.p308_transition_renewal(pg_temp.uid(1), pg_temp.uid(965),
  pg_temp.h('t8'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 7, 'completed', null, null);
reset role;
select pg_temp.check(
  (select stage = 'completed' and status = 'completed' and completed_at is not null and version = 8
     from public.renewals where id = pg_temp.r1())
  and (select array_agg(action order by version) = array['created','updated','transitioned','blocked','unblocked','transitioned','transitioned','completed']
       from public.renewal_stage_events where renewal_id = pg_temp.r1())
  and (select count(*) = 0 from public.renewal_reminder_jobs where renewal_id = pg_temp.r1() and state = 'scheduled')
  and (select count(*) = 8 from public.domain_events where event_type = 'renewal.lifecycle.changed'
       and payload->>'resource_id' = pg_temp.r1()::text),
  'RENEWAL_FULL_STAGE_LIFECYCLE');
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,null,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(966), pg_temp.h('t9'), pg_temp.uid(100), pg_temp.uid(101), pg_temp.r1(), 8,
  'cancelled', 'duplicate_entry'), 'RENEWAL_TERMINAL', 'RENEWAL_TERMINAL_IMMUTABLE');

-- Batch transition is all-or-nothing.
set local role service_role;
insert into pg_temp.results select 'r2', public.p308_create_renewal(pg_temp.uid(1), pg_temp.uid(970), pg_temp.h('r2'),
  pg_temp.uid(100), pg_temp.uid(101), jsonb_build_object('type', 'eid', 'label', 'EID', 'employee_id', pg_temp.uid(52),
  'due_date', (current_date + 10)::text));
insert into pg_temp.results select 'r3', public.p308_create_renewal(pg_temp.uid(1), pg_temp.uid(971), pg_temp.h('r3'),
  pg_temp.uid(100), pg_temp.uid(101), jsonb_build_object('type', 'medical_insurance', 'label', 'Medical',
  'due_date', (current_date - 3)::text));
reset role;
select pg_temp.expect_error(format($q$select public.p308_batch_transition_renewals(%L,%L,%L,%L,%L,%L,%L,null)$q$,
  pg_temp.uid(1), pg_temp.uid(972), pg_temp.h('batch0'), pg_temp.uid(100), pg_temp.uid(101),
  jsonb_build_array(
    jsonb_build_object('renewal_id', (select v->>'renewal_id' from pg_temp.results where k = 'r2'), 'expected_version', 1),
    jsonb_build_object('renewal_id', (select v->>'renewal_id' from pg_temp.results where k = 'r3'), 'expected_version', 9)),
  'in_progress'), 'STALE_VERSION', 'BATCH_STALE_ROLLS_BACK');
select pg_temp.check((select count(*) = 2 from public.renewals r join pg_temp.results x
  on x.k in ('r2', 'r3') and r.id = (x.v->>'renewal_id')::uuid where r.stage = 'due'), 'BATCH_NO_PARTIAL');
set local role service_role;
insert into pg_temp.results select 'batch1', public.p308_batch_transition_renewals(pg_temp.uid(1), pg_temp.uid(973),
  pg_temp.h('batch1'), pg_temp.uid(100), pg_temp.uid(101), jsonb_build_array(
    jsonb_build_object('renewal_id', (select v->>'renewal_id' from pg_temp.results where k = 'r2'), 'expected_version', 1),
    jsonb_build_object('renewal_id', (select v->>'renewal_id' from pg_temp.results where k = 'r3'), 'expected_version', 1)),
  'in_progress', null);
reset role;
select pg_temp.check(
  (select (v->>'count')::int = 2 from pg_temp.results where k = 'batch1')
  and (select count(*) = 2 from public.renewal_stage_events where batch_operation_id = pg_temp.uid(973)),
  'BATCH_TRANSITION_ATOMIC');
select pg_temp.check((select status = 'overdue' from public.renewals r join pg_temp.results x on x.k = 'r3'
  and r.id = (x.v->>'renewal_id')::uuid), 'PAST_DUE_IS_OVERDUE');

-- Licence-backfill rows cannot be cancelled here.
update public.company_profiles set license_expiry = current_date + 200 where id = pg_temp.uid(101);
select pg_temp.check((select count(*) >= 1 from public.renewals where company_id = pg_temp.uid(101)
  and source <> 'manual' and stage = 'due'), 'LICENSE_SYNC_STAGE_DEFAULT');
select pg_temp.expect_error(format($q$select public.p308_transition_renewal(%L,%L,%L,%L,%L,%L,%s,%L,null,%L)$q$,
  pg_temp.uid(1), pg_temp.uid(974), pg_temp.h('lic'), pg_temp.uid(100), pg_temp.uid(101),
  (select id from public.renewals where company_id = pg_temp.uid(101) and source <> 'manual' limit 1),
  (select version from public.renewals where company_id = pg_temp.uid(101) and source <> 'manual' limit 1),
  'cancelled', 'not_needed'), 'RENEWAL_LICENSE_LOCKED', 'LICENSE_CANCEL_LOCKED');

-- 7. Dubai dates -------------------------------------------------------------------
select pg_temp.check(
  private.p308_dubai_date('2026-12-31 19:59:59+00') = date '2026-12-31'
  and private.p308_dubai_date('2026-12-31 20:00:00+00') = date '2027-01-01'
  and private.p308_dubai_date('2028-02-28 20:00:00+00') = date '2028-02-29'
  and private.p308_dubai_date('2026-01-31 20:00:00+00') = date '2026-02-01'
  and private.p308_dubai_instant(date '2028-02-29') = timestamptz '2028-02-29 04:00:00+00'
  and private.p308_legacy_status(private.p308_dubai_today(), 'due') = 'due_soon'
  and private.p308_legacy_status(private.p308_dubai_today() - 1, 'due') = 'overdue'
  and private.p308_legacy_status(private.p308_dubai_today() + 31, 'due') = 'upcoming',
  'DUBAI_MIDNIGHT_MONTH_YEAR_LEAP_BOUNDARIES');

-- 8. Materialization health -------------------------------------------------------------
select public.recompute_renewal_status();
select pg_temp.check(
  (select count(*) = 1 from public.renewal_materialization_runs where dubai_date = private.p308_dubai_today())
  and (select count(*) >= 1 from public.domain_events where event_type = 'renewal.attention.daily'
       and payload->>'resource_id' = (select v->>'renewal_id' from pg_temp.results where k = 'r3')
       and payload->>'state' = 'overdue')
  and (select (public.p308_read_renewal_health()->>'stale')::boolean = false),
  'MATERIALIZATION_HEALTH_ATTENTION');
select public.recompute_renewal_status();
select pg_temp.check(
  (select count(*) = 1 from public.domain_events where event_type = 'renewal.attention.daily'
     and payload->>'resource_id' = (select v->>'renewal_id' from pg_temp.results where k = 'r3')),
  'ATTENTION_DAILY_DEDUPED');

-- 10. Code-review remediation ------------------------------------------------------
-- F5: legacy writers (licence sync, direct status cancel) supersede reminders centrally.
select pg_temp.check((select count(*) > 0 from public.renewal_reminder_jobs j join public.renewals r on r.id = j.renewal_id
  where r.company_id = pg_temp.uid(101) and r.source <> 'manual' and j.state = 'scheduled'), 'CR_F5_LICENCE_INSERT_SCHEDULES');
update public.company_profiles set license_expiry = current_date + 100 where id = pg_temp.uid(101);
select pg_temp.check(
  (select bool_and(j.remind_at < private.p308_dubai_instant(current_date + 101)) from public.renewal_reminder_jobs j
     join public.renewals r on r.id = j.renewal_id
     where r.company_id = pg_temp.uid(101) and r.source <> 'manual' and j.state = 'scheduled')
  and (select count(*) = 0 from public.renewal_reminder_jobs j join public.renewals r on r.id = j.renewal_id
     join public.event_jobs e on e.id = j.job_id
     where r.company_id = pg_temp.uid(101) and r.source <> 'manual' and j.state = 'superseded' and e.state <> 'cancelled')
  and (select count(*) > 0 from public.renewal_reminder_jobs j join public.renewals r on r.id = j.renewal_id
     where r.company_id = pg_temp.uid(101) and r.source <> 'manual' and j.state = 'superseded'),
  'CR_F5_LICENCE_REDATE_SUPERSEDES');
update public.renewals set status = 'cancelled' where company_id = pg_temp.uid(101) and source <> 'manual';
select pg_temp.check(
  (select count(*) = 0 from public.renewal_reminder_jobs j join public.renewals r on r.id = j.renewal_id
     where r.company_id = pg_temp.uid(101) and r.source <> 'manual' and j.state = 'scheduled'),
  'CR_F5_LEGACY_CANCEL_CLEARS_REMINDERS');

-- F6: masked last4 can never outlive the ciphertext it was derived from.
insert into public.employees(id, tenant_id, company_id, name, passport_no_encrypted, passport_no_last4,
  passport_no_last4_source) values
  (pg_temp.uid(61), pg_temp.uid(100), pg_temp.uid(101), 'Mask Kept', 'cipher-a', '1111', encode(sha256(convert_to('cipher-a','UTF8')),'hex')),
  (pg_temp.uid(62), pg_temp.uid(100), pg_temp.uid(101), 'Mask Unbound', 'cipher-b', '2222', null);
select pg_temp.check(
  (select passport_no_last4 = '1111' from public.employees where id = pg_temp.uid(61))
  and (select passport_no_last4 is null from public.employees where id = pg_temp.uid(62)),
  'CR_F6_INSERT_REQUIRES_BOUND_SOURCE');
update public.employees set passport_no_encrypted = 'cipher-c' where id = pg_temp.uid(61);
select pg_temp.check((select passport_no_last4 is null and passport_no_last4_source is null
  from public.employees where id = pg_temp.uid(61)), 'CR_F6_CIPHERTEXT_CHANGE_CLEARS_STALE_MASK');
select pg_temp.check((select passport_no_last4 = '4567' and passport_no_last4_source is not null
  from public.employees where name = 'Alpha'), 'CR_F6_RPC_WRITES_KEEP_MASK');

-- F7: escalation requires a delivered 30-day reminder plus a one-day grace.
set local role service_role;
insert into pg_temp.results select 'r4', public.p308_create_renewal(pg_temp.uid(1), pg_temp.uid(980), pg_temp.h('r4'),
  pg_temp.uid(100), pg_temp.uid(101), jsonb_build_object('type', 'ejari', 'label', 'No reminder yet',
  'due_date', (current_date + 20)::text));
insert into pg_temp.results select 'r5', public.p308_create_renewal(pg_temp.uid(1), pg_temp.uid(981), pg_temp.h('r5'),
  pg_temp.uid(100), pg_temp.uid(101), jsonb_build_object('type', 'visa', 'label', 'Reminder delivered',
  'due_date', (current_date + 25)::text));
reset role;
-- Simulate P3.10 having delivered r5's 30-day reminder two days ago.
insert into public.renewal_reminder_jobs(renewal_id, renewal_version, window_days, remind_at, event_id, job_id)
select (v->>'renewal_id')::uuid, 1, 30, now() - interval '2 days', e.id, j.id
from pg_temp.results, lateral (select id from public.domain_events limit 1) e,
  lateral (select id from public.event_jobs limit 1) j where k = 'r5';
update public.event_jobs set state = 'succeeded', succeeded_at = now()
where id = (select job_id from public.renewal_reminder_jobs where renewal_id = (select (v->>'renewal_id')::uuid from pg_temp.results where k = 'r5') and window_days = 30);
select public.recompute_renewal_status();
select pg_temp.check(
  (select escalation_level = 0 from public.renewals where id = (select (v->>'renewal_id')::uuid from pg_temp.results where k = 'r4'))
  and (select escalation_level = 1 from public.renewals where id = (select (v->>'renewal_id')::uuid from pg_temp.results where k = 'r5')),
  'CR_F7_ESCALATE_ONLY_AFTER_DELIVERED_30_DAY_REMINDER');

-- F1: an import whose execution job died is reconciled to a terminal, audited state.
set local role service_role;
select public.p308_register_import(pg_temp.uid(1), pg_temp.uid(982), pg_temp.h('d1'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(720), pg_temp.path(720), pg_temp.h('artifact-3'), 50);
select public.p308_record_import_validation(pg_temp.uid(1), pg_temp.uid(983), pg_temp.h('d2'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(720), 1, 2, 0, '[]');
select public.p308_request_import_execution(pg_temp.uid(1), pg_temp.uid(984), pg_temp.h('d3'), pg_temp.uid(100),
  pg_temp.uid(101), pg_temp.uid(720), 2);
reset role;
update public.event_jobs set state = 'dead', dead_at = now(), last_error_category = 'unknown', last_error_code = 'PROVIDER_FAILURE'
where event_id = (select execution_event_id from public.bulk_import_jobs where id = pg_temp.uid(720));
set local role service_role;
insert into pg_temp.results select 'reconcile', jsonb_build_object('n', public.p308_reconcile_stuck_imports(10));
reset role;
select pg_temp.check(
  (select (v->>'n')::int >= 1 from pg_temp.results where k = 'reconcile')
  and (select status::text = 'failed' and failure_code = 'IMPORT_ATTEMPTS_EXHAUSTED' from public.bulk_import_jobs where id = pg_temp.uid(720))
  and (select count(*) = 1 from public.domain_events where event_type = 'employee.import.finished'
       and payload->>'resource_id' = pg_temp.uid(720)::text),
  'CR_F1_DEAD_EXECUTION_RECONCILED');

-- 9. RLS: new history tables are invisible to authenticated users ---------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(5), 'role', 'authenticated')::text, true);
do $$ begin
  begin
    perform 1 from public.renewal_stage_events;
    raise exception 'RLS_HISTORY_READABLE';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.check((select count(*) = 1 from public.employees), 'EMPLOYEE_SELF_RLS_ONLY_OWN');
reset role;

select 'P308_ASSERTIONS_PASSED ' || count(*) from pg_temp.assertions;
rollback;
