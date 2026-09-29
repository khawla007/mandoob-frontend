-- P3.08 employees, employee imports and renewals.
--
-- Forward-only and additive. Every command RPC is SECURITY DEFINER with an
-- empty search_path, is executable by service_role only, and re-resolves the
-- actor from fresh profile/assignment/customer/employee rows. Domain events are
-- published through the frozen P3.10 v1.0.0 interface inside the committing
-- transaction. Channel delivery, recipients, consent and scheduler
-- configuration stay with P3.10.
begin;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function private.p308_dubai_date(p_at timestamptz)
returns date
language sql
immutable
security definer
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Dubai')::date;
$$;

create function private.p308_dubai_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.p308_dubai_date(pg_catalog.now());
$$;

create function private.p308_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'P308_HISTORY_IMMUTABLE';
end;
$$;

create function private.p308_event_uuid(p_seed text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_seed, 'UTF8')), 'hex');
begin
  return (
    pg_catalog.substr(v_hash, 1, 8) || '-' ||
    pg_catalog.substr(v_hash, 9, 4) || '-4' ||
    pg_catalog.substr(v_hash, 14, 3) || '-a' ||
    pg_catalog.substr(v_hash, 18, 3) || '-' ||
    pg_catalog.substr(v_hash, 21, 12)
  )::uuid;
end;
$$;

create function private.p308_publish(
  p_seed text,
  p_event_type text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed text := p_event_type || ':1:' || p_seed;
begin
  return public.publish_domain_event(
    private.p308_event_uuid(v_seed),
    p_event_type,
    1::smallint,
    pg_catalog.now(),
    p_tenant_id,
    p_company_id,
    p_actor_id,
    coalesce(p_correlation_id, private.p308_event_uuid('correlation:' || v_seed)),
    null::uuid,
    'internal'::text,
    p_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_seed, 'UTF8')), 'hex')
  );
end;
$$;

-- Resolves the caller's role for one company from fresh rows. A PRO holds a
-- FOR SHARE lock on its active assignment so a concurrent release serializes
-- behind the command instead of racing it.
create function private.p308_resolve_actor(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_allowed text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select profile.role::text into v_role
  from public.profiles profile
  where profile.id = p_actor_id and profile.status::text = 'active';
  if v_role is null or not (v_role = any (p_allowed)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.company_profiles company
    where company.id = p_company_id and company.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_role = 'pro' then
    perform 1
    from public.pro_company_assignments assignment
    where assignment.pro_profile_id = p_actor_id
      and assignment.tenant_id = p_tenant_id
      and assignment.company_id = p_company_id
      and assignment.status::text = 'active'
    for share;
    if not found or not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  elsif v_role = 'customer' then
    if not exists (
      select 1
      from public.customer_profiles customer
      join public.profiles profile on profile.id = customer.profile_id
      where customer.profile_id = p_actor_id
        and customer.linked_company_id = p_company_id
        and profile.tenant_id = p_tenant_id
    ) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  elsif v_role = 'employee' then
    if not exists (
      select 1
      from public.employees employee
      join public.profiles profile on profile.id = employee.profile_id
      where employee.profile_id = p_actor_id
        and employee.tenant_id = p_tenant_id
        and employee.company_id = p_company_id
        and employee.status::text = 'active'
        and profile.tenant_id = p_tenant_id
    ) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  elsif v_role in ('admin', 'super_admin') then
    if exists (
      select 1 from public.profiles profile
      where profile.id = p_actor_id and profile.tenant_id is not null
    ) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  else
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operation receipts (replay safety)
-- ---------------------------------------------------------------------------

create table public.p308_operation_receipts (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  kind text not null,
  payload_hash text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, operation_id),
  constraint p308_receipt_kind_valid check (kind ~ '^[a-z][a-z0-9_.]{2,63}$'),
  constraint p308_receipt_hash_valid check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint p308_receipt_result_object check (pg_catalog.jsonb_typeof(result) = 'object')
);
create trigger p308_operation_receipts_immutable
  before update or delete on public.p308_operation_receipts
  for each row execute function private.p308_reject_mutation();

create function private.p308_receipt_lookup(
  p_actor_id uuid,
  p_operation_id uuid,
  p_kind text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.p308_operation_receipts%rowtype;
begin
  if p_actor_id is null or p_operation_id is null
    or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_OPERATION';
  end if;
  -- Serialize concurrent calls sharing one operation identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p308:' || p_actor_id::text || ':' || p_operation_id::text, 0)
  );
  select * into v_receipt
  from public.p308_operation_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.operation_id = p_operation_id;
  if not found then return null; end if;
  if v_receipt.kind <> p_kind or v_receipt.payload_hash <> p_payload_hash then
    raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
  end if;
  return v_receipt.result || pg_catalog.jsonb_build_object('replayed', true);
end;
$$;

create function private.p308_receipt_store(
  p_actor_id uuid,
  p_operation_id uuid,
  p_kind text,
  p_payload_hash text,
  p_tenant_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.p308_operation_receipts (
    actor_id, operation_id, kind, payload_hash, tenant_id, result
  ) values (
    p_actor_id, p_operation_id, p_kind, p_payload_hash, p_tenant_id, p_result
  );
  return p_result || pg_catalog.jsonb_build_object('replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------

alter table public.employees
  add column version bigint not null default 1,
  add column job_title text,
  add column passport_no_last4 text,
  add column visa_no_last4 text,
  add column emirates_id_last4 text,
  add column deactivated_at timestamptz,
  add constraint employees_version_positive check (version >= 1),
  add constraint employees_name_shape check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 160),
  add constraint employees_job_title_shape check (job_title is null or pg_catalog.char_length(job_title) between 1 and 120),
  add constraint employees_last4_shape check (
    (passport_no_last4 is null or passport_no_last4 ~ '^[A-Z0-9]{1,4}$')
    and (visa_no_last4 is null or visa_no_last4 ~ '^[A-Z0-9]{1,4}$')
    and (emirates_id_last4 is null or emirates_id_last4 ~ '^[0-9]{1,4}$')
  ),
  add constraint employees_deactivation_shape check (
    (status::text = 'active' and deactivated_at is null) or status::text <> 'active'
  );

create function private.p308_employee_version_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version = old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger p308_employee_version_guard
  before update on public.employees
  for each row execute function private.p308_employee_version_guard();

alter table public.employee_notification_preferences
  add column version bigint not null default 1,
  add constraint employee_preferences_version_positive check (version >= 1);

create table public.employee_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  employee_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  operation_id uuid,
  action text not null,
  version bigint not null,
  changed_fields text[] not null default '{}',
  import_job_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  constraint employee_audit_action_valid check (action in (
    'created', 'updated', 'deactivated', 'reactivated', 'self_profile_updated',
    'preferences_updated', 'imported'
  )),
  constraint employee_audit_employee_fk foreign key (tenant_id, company_id, employee_id)
    references public.employees (tenant_id, company_id, id) on delete restrict
);
create index employee_audit_events_employee_idx
  on public.employee_audit_events (tenant_id, company_id, employee_id, created_at desc, id);
create trigger employee_audit_events_immutable
  before update or delete on public.employee_audit_events
  for each row execute function private.p308_reject_mutation();

create function private.p308_employee_event(
  p_employee public.employees,
  p_actor_id uuid,
  p_operation_id uuid,
  p_action text,
  p_fields text[],
  p_audit_action text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.employee_audit_events (
    tenant_id, company_id, employee_id, actor_id, operation_id, action, version, changed_fields
  ) values (
    p_employee.tenant_id, p_employee.company_id, p_employee.id, p_actor_id, p_operation_id,
    p_action, p_employee.version, coalesce(p_fields, '{}')
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_employee.tenant_id, p_actor_id, p_audit_action, p_source,
    pg_catalog.jsonb_build_object(
      'entity', 'employee',
      'op', p_action,
      'employee_id', p_employee.id,
      'company_id', p_employee.company_id,
      'operation_id', p_operation_id,
      'version', p_employee.version,
      'fields', pg_catalog.to_jsonb(coalesce(p_fields, '{}'))
    )
  );
  perform private.p308_publish(
    'employee:' || p_employee.id::text || ':version:' || p_employee.version::text,
    'employee.record.changed',
    p_employee.tenant_id,
    p_employee.company_id,
    p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_employee.id,
      'operation_id', coalesce(p_operation_id, private.p308_event_uuid('employee-op:' || p_employee.id::text || ':' || p_employee.version::text)),
      'version', p_employee.version,
      'change', p_action
    )
  );
end;
$$;

-- Validates one employee payload. Ciphertext, lookup hash and last4 for each
-- identifier travel together; plaintext identifiers never reach the database.
create function private.p308_validate_employee_payload(p_payload jsonb, p_partial boolean)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_prefix text;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if v_key not in (
      'name', 'email', 'phone', 'nationality', 'job_title',
      'passport_no_encrypted', 'passport_no_hash', 'passport_no_last4',
      'visa_no_encrypted', 'visa_no_last4', 'visa_expiry',
      'emirates_id_encrypted', 'emirates_id_last4', 'eid_expiry'
    ) then
      raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
    end if;
  end loop;
  if (not p_partial or p_payload ? 'name')
    and pg_catalog.char_length(pg_catalog.btrim(coalesce(p_payload->>'name', ''))) not between 1 and 160
  then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  if p_payload->>'email' is not null
    and (p_payload->>'email' !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      or pg_catalog.char_length(p_payload->>'email') > 254)
  then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  if p_payload->>'phone' is not null and p_payload->>'phone' !~ '^\+?[0-9 ()-]{7,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  foreach v_prefix in array array['passport_no', 'visa_no', 'emirates_id'] loop
    if (p_payload ? (v_prefix || '_encrypted')) is distinct from (p_payload ? (v_prefix || '_last4'))
      or ((p_payload->>(v_prefix || '_encrypted')) is null) is distinct from ((p_payload->>(v_prefix || '_last4')) is null)
    then
      raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
    end if;
  end loop;
  if (p_payload ? 'passport_no_encrypted') is distinct from (p_payload ? 'passport_no_hash')
    or ((p_payload->>'passport_no_encrypted') is null) is distinct from ((p_payload->>'passport_no_hash') is null)
    or (p_payload->>'passport_no_hash' is not null and p_payload->>'passport_no_hash' !~ '^[a-f0-9]{64}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  if (p_payload->>'visa_expiry' is not null and p_payload->>'visa_expiry' !~ '^\d{4}-\d{2}-\d{2}$')
    or (p_payload->>'eid_expiry' is not null and p_payload->>'eid_expiry' !~ '^\d{4}-\d{2}-\d{2}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
end;
$$;

create function public.p308_create_employee(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_employee jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_employee public.employees%rowtype;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'employee.create', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  perform private.p308_validate_employee_payload(p_employee, false);

  begin
    insert into public.employees (
      tenant_id, company_id, name, email, phone, nationality, job_title,
      passport_no_encrypted, passport_no_hash, passport_no_last4,
      visa_no_encrypted, visa_no_last4, visa_expiry,
      emirates_id_encrypted, emirates_id_last4, eid_expiry, status
    ) values (
      p_tenant_id, p_company_id, pg_catalog.btrim(p_employee->>'name'),
      nullif(pg_catalog.btrim(p_employee->>'email'), ''),
      nullif(pg_catalog.btrim(p_employee->>'phone'), ''),
      nullif(pg_catalog.btrim(p_employee->>'nationality'), ''),
      nullif(pg_catalog.btrim(p_employee->>'job_title'), ''),
      p_employee->>'passport_no_encrypted', p_employee->>'passport_no_hash', p_employee->>'passport_no_last4',
      p_employee->>'visa_no_encrypted', p_employee->>'visa_no_last4', (p_employee->>'visa_expiry')::date,
      p_employee->>'emirates_id_encrypted', p_employee->>'emirates_id_last4', (p_employee->>'eid_expiry')::date,
      'active'
    )
    returning * into v_employee;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_PASSPORT_DUPLICATE';
  end;

  perform private.p308_employee_event(
    v_employee, p_actor_id, p_operation_id, 'created', array['record'], 'created', 'self_serve'
  );
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'employee.create', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('employee_id', v_employee.id, 'version', v_employee.version)
  );
end;
$$;

create function public.p308_update_employee(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_expected_version bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_employee public.employees%rowtype;
  v_fields text[];
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'employee.update', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  perform private.p308_validate_employee_payload(p_patch, true);
  select pg_catalog.array_agg(key order by key) into v_fields from pg_catalog.jsonb_object_keys(p_patch) key;
  if v_fields is null then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;

  select * into v_employee
  from public.employees employee
  where employee.id = p_employee_id
    and employee.tenant_id = p_tenant_id
    and employee.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;
  if v_employee.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;

  begin
    update public.employees employee set
      name = case when p_patch ? 'name' then pg_catalog.btrim(p_patch->>'name') else employee.name end,
      email = case when p_patch ? 'email' then nullif(pg_catalog.btrim(p_patch->>'email'), '') else employee.email end,
      phone = case when p_patch ? 'phone' then nullif(pg_catalog.btrim(p_patch->>'phone'), '') else employee.phone end,
      nationality = case when p_patch ? 'nationality' then nullif(pg_catalog.btrim(p_patch->>'nationality'), '') else employee.nationality end,
      job_title = case when p_patch ? 'job_title' then nullif(pg_catalog.btrim(p_patch->>'job_title'), '') else employee.job_title end,
      passport_no_encrypted = case when p_patch ? 'passport_no_encrypted' then p_patch->>'passport_no_encrypted' else employee.passport_no_encrypted end,
      passport_no_hash = case when p_patch ? 'passport_no_hash' then p_patch->>'passport_no_hash' else employee.passport_no_hash end,
      passport_no_last4 = case when p_patch ? 'passport_no_last4' then p_patch->>'passport_no_last4' else employee.passport_no_last4 end,
      visa_no_encrypted = case when p_patch ? 'visa_no_encrypted' then p_patch->>'visa_no_encrypted' else employee.visa_no_encrypted end,
      visa_no_last4 = case when p_patch ? 'visa_no_last4' then p_patch->>'visa_no_last4' else employee.visa_no_last4 end,
      visa_expiry = case when p_patch ? 'visa_expiry' then (p_patch->>'visa_expiry')::date else employee.visa_expiry end,
      emirates_id_encrypted = case when p_patch ? 'emirates_id_encrypted' then p_patch->>'emirates_id_encrypted' else employee.emirates_id_encrypted end,
      emirates_id_last4 = case when p_patch ? 'emirates_id_last4' then p_patch->>'emirates_id_last4' else employee.emirates_id_last4 end,
      eid_expiry = case when p_patch ? 'eid_expiry' then (p_patch->>'eid_expiry')::date else employee.eid_expiry end,
      version = employee.version + 1
    where employee.id = v_employee.id
    returning * into v_employee;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_PASSPORT_DUPLICATE';
  end;

  perform private.p308_employee_event(
    v_employee, p_actor_id, p_operation_id, 'updated', v_fields, 'updated', 'self_serve'
  );
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'employee.update', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('employee_id', v_employee.id, 'version', v_employee.version)
  );
end;
$$;

create function public.p308_set_employee_status(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_expected_version bigint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_employee public.employees%rowtype;
  v_action text;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'employee.status', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if p_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_STATUS';
  end if;
  select * into v_employee
  from public.employees employee
  where employee.id = p_employee_id
    and employee.tenant_id = p_tenant_id
    and employee.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;
  if v_employee.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  if v_employee.status::text = p_status then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_STATUS_UNCHANGED';
  end if;
  if v_employee.status::text = 'terminated' then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_STATUS_TERMINAL';
  end if;
  update public.employees employee set
    status = p_status::public.employee_status,
    deactivated_at = case when p_status = 'inactive' then pg_catalog.now() else null end,
    version = employee.version + 1
  where employee.id = v_employee.id
  returning * into v_employee;
  v_action := case when p_status = 'inactive' then 'deactivated' else 'reactivated' end;
  perform private.p308_employee_event(
    v_employee, p_actor_id, p_operation_id, v_action, array['status'],
    case when p_status = 'inactive' then 'suspended' else 'reactivated' end, 'self_serve'
  );
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'employee.status', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('employee_id', v_employee.id, 'version', v_employee.version, 'status', p_status)
  );
end;
$$;

-- Employee self-service. The employee id is resolved from the actor, never
-- accepted from the caller. Only phone and reminder preference are writable.
create function public.p308_update_employee_self(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_expected_version bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_employee public.employees%rowtype;
  v_pref public.employee_notification_preferences%rowtype;
  v_key text;
  v_fields text[] := '{}';
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'employee.self', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  if pg_catalog.jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_patch) loop
    if v_key not in ('phone', 'renewal_reminders_enabled') then
      raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
    end if;
  end loop;
  if p_patch ? 'renewal_reminders_enabled'
    and pg_catalog.jsonb_typeof(p_patch->'renewal_reminders_enabled') <> 'boolean'
  then
    raise exception using errcode = '22023', message = 'INVALID_EMPLOYEE_PAYLOAD';
  end if;
  if p_patch ? 'phone' then
    perform private.p308_validate_employee_payload(
      pg_catalog.jsonb_build_object('phone', p_patch->'phone'), true
    );
  end if;

  select employee.* into v_employee
  from public.employees employee
  join public.profiles profile on profile.id = employee.profile_id
  where employee.profile_id = p_actor_id
    and employee.tenant_id = p_tenant_id
    and employee.status::text = 'active'
    and profile.role::text = 'employee'
    and profile.status::text = 'active'
    and profile.tenant_id = p_tenant_id
  for update of employee;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_employee.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;

  if p_patch ? 'phone' then
    v_fields := v_fields || 'phone'::text;
  end if;
  if p_patch ? 'renewal_reminders_enabled' then
    v_fields := v_fields || 'renewal_reminders_enabled'::text;
    insert into public.employee_notification_preferences (
      tenant_id, employee_id, profile_id, renewal_reminders_enabled
    ) values (
      v_employee.tenant_id, v_employee.id, p_actor_id,
      (p_patch->>'renewal_reminders_enabled')::boolean
    )
    on conflict (employee_id) do update
      set renewal_reminders_enabled = excluded.renewal_reminders_enabled,
          version = public.employee_notification_preferences.version + 1
    returning * into v_pref;
  end if;
  update public.employees employee set
    phone = case when p_patch ? 'phone' then nullif(pg_catalog.btrim(p_patch->>'phone'), '') else employee.phone end,
    version = employee.version + 1
  where employee.id = v_employee.id
  returning * into v_employee;

  perform private.p308_employee_event(
    v_employee, p_actor_id, p_operation_id,
    case when p_patch ? 'phone' then 'self_profile_updated' else 'preferences_updated' end,
    v_fields, 'updated', 'self_serve'
  );
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'employee.self', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('employee_id', v_employee.id, 'version', v_employee.version)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee imports
-- ---------------------------------------------------------------------------

alter table public.bulk_import_jobs
  add column version bigint not null default 1,
  add column operation_id uuid,
  add column requested_by uuid references public.profiles(id) on delete restrict,
  add column artifact_sha256 text,
  add column artifact_bytes integer,
  add column artifact_encryption text,
  add column retention_expires_at timestamptz,
  add column artifact_deleted_at timestamptz,
  add column cancel_requested_at timestamptz,
  add column next_row integer not null default 0,
  add column next_batch integer not null default 0,
  add column inserted_rows integer not null default 0,
  add column skipped_rows integer not null default 0,
  add column failure_code text,
  add column execution_event_id uuid references public.domain_events(id) on delete restrict,
  add constraint bulk_import_jobs_artifact_shape check (
    (artifact_sha256 is null and artifact_bytes is null and artifact_encryption is null)
    or (
      artifact_sha256 ~ '^[a-f0-9]{64}$'
      and artifact_bytes between 1 and 1000000
      and artifact_encryption = 'aes-256-gcm:v1'
    )
  ),
  add constraint bulk_import_jobs_cursor_valid check (
    next_row >= 0 and next_batch >= 0 and inserted_rows >= 0 and skipped_rows >= 0
    and (total_rows is null or next_row <= total_rows)
  ),
  add constraint bulk_import_jobs_failure_code_shape check (
    failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
  );

create unique index bulk_import_jobs_active_artifact_unique
  on public.bulk_import_jobs (tenant_id, company_id, artifact_sha256)
  where artifact_sha256 is not null
    and status in ('uploaded', 'validating', 'validated', 'importing');
create index bulk_import_jobs_retention_idx
  on public.bulk_import_jobs (retention_expires_at, id)
  where artifact_deleted_at is null and retention_expires_at is not null;

create table public.bulk_import_row_outcomes (
  job_id uuid not null references public.bulk_import_jobs(id) on delete restrict,
  row_number integer not null,
  batch_no integer not null,
  outcome text not null,
  employee_id uuid references public.employees(id) on delete restrict,
  error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (job_id, row_number),
  constraint bulk_import_row_outcome_valid check (
    outcome in ('inserted', 'duplicate_existing', 'duplicate_in_file', 'invalid')
  ),
  constraint bulk_import_row_outcome_shape check (
    (outcome = 'inserted' and employee_id is not null and error_code is null)
    or (outcome <> 'inserted' and employee_id is null and error_code ~ '^[A-Z][A-Z0-9_]{1,63}$')
  ),
  constraint bulk_import_row_number_valid check (row_number >= 1 and batch_no >= 0)
);
create trigger bulk_import_row_outcomes_immutable
  before update or delete on public.bulk_import_row_outcomes
  for each row execute function private.p308_reject_mutation();

create table public.bulk_import_artifact_access (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs(id) on delete restrict,
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  worker_id uuid,
  purpose text not null,
  artifact_sha256 text not null,
  accessed_at timestamptz not null default pg_catalog.now(),
  constraint bulk_import_access_purpose_valid check (purpose in ('validate', 'execute', 'cleanup')),
  constraint bulk_import_access_accessor check ((actor_id is null) <> (worker_id is null)),
  constraint bulk_import_access_hash check (artifact_sha256 ~ '^[a-f0-9]{64}$')
);
create index bulk_import_artifact_access_job_idx
  on public.bulk_import_artifact_access (job_id, accessed_at, id);
create trigger bulk_import_artifact_access_immutable
  before update or delete on public.bulk_import_artifact_access
  for each row execute function private.p308_reject_mutation();

create function private.p308_lock_import_job(
  p_tenant_id uuid,
  p_company_id uuid,
  p_job_id uuid
)
returns public.bulk_import_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
begin
  select * into v_job
  from public.bulk_import_jobs job
  where job.id = p_job_id and job.tenant_id = p_tenant_id and job.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_FOUND';
  end if;
  return v_job;
end;
$$;

create function public.p308_register_import(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_job_id uuid,
  p_storage_path text,
  p_artifact_sha256 text,
  p_artifact_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_existing uuid;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'import.register', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if p_storage_path is distinct from (p_tenant_id::text || '/' || p_company_id::text || '/' || p_job_id::text || '.csv.enc') then
    raise exception using errcode = '22023', message = 'INVALID_IMPORT_ARTIFACT';
  end if;
  select job.id into v_existing
  from public.bulk_import_jobs job
  where job.tenant_id = p_tenant_id and job.company_id = p_company_id
    and job.artifact_sha256 = p_artifact_sha256
    and job.status in ('uploaded', 'validating', 'validated', 'importing');
  if found then
    raise exception using errcode = 'P0001', message = 'IMPORT_DUPLICATE_ARTIFACT',
      detail = v_existing::text;
  end if;
  insert into public.bulk_import_jobs (
    id, tenant_id, created_by, kind, company_id, storage_path, status,
    operation_id, artifact_sha256, artifact_bytes, artifact_encryption, retention_expires_at
  ) values (
    p_job_id, p_tenant_id, p_actor_id, 'employees', p_company_id, p_storage_path, 'uploaded',
    p_operation_id, p_artifact_sha256, p_artifact_bytes, 'aes-256-gcm:v1',
    pg_catalog.now() + interval '30 days'
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'created', 'self_serve', pg_catalog.jsonb_build_object(
    'entity', 'employee_import', 'import_job_id', p_job_id, 'company_id', p_company_id,
    'operation_id', p_operation_id, 'artifact_bytes', p_artifact_bytes
  ));
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'import.register', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('job_id', p_job_id, 'version', 1)
  );
end;
$$;

create function public.p308_record_import_artifact_access(
  p_job_id uuid,
  p_actor_id uuid,
  p_worker_id uuid,
  p_purpose text,
  p_artifact_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
begin
  select * into v_job from public.bulk_import_jobs where id = p_job_id;
  if not found or v_job.artifact_sha256 is null or v_job.artifact_deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_FOUND';
  end if;
  if v_job.artifact_sha256 <> p_artifact_sha256 then
    raise exception using errcode = 'P0001', message = 'IMPORT_ARTIFACT_MISMATCH';
  end if;
  if p_actor_id is not null then
    perform private.p308_resolve_actor(p_actor_id, v_job.tenant_id, v_job.company_id, array['pro']);
  end if;
  insert into public.bulk_import_artifact_access (
    job_id, tenant_id, company_id, actor_id, worker_id, purpose, artifact_sha256
  ) values (
    v_job.id, v_job.tenant_id, v_job.company_id, p_actor_id, p_worker_id, p_purpose, p_artifact_sha256
  );
end;
$$;

create function public.p308_record_import_validation(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_job_id uuid,
  p_expected_version bigint,
  p_total_rows integer,
  p_error_rows integer,
  p_errors jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_job public.bulk_import_jobs%rowtype;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'import.validate', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if p_total_rows not between 1 and 5000 or p_error_rows not between 0 and p_total_rows
    or pg_catalog.jsonb_typeof(p_errors) <> 'array' or pg_catalog.jsonb_array_length(p_errors) > 500
    or pg_catalog.jsonb_path_exists(p_errors, '$[*].keyvalue() ? (@.key != "row_number" && @.key != "field" && @.key != "code")')
  then
    raise exception using errcode = '22023', message = 'INVALID_IMPORT_VALIDATION';
  end if;
  v_job := private.p308_lock_import_job(p_tenant_id, p_company_id, p_job_id);
  if v_job.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  if v_job.status::text <> 'uploaded' then
    raise exception using errcode = 'P0001', message = 'INVALID_IMPORT_TRANSITION';
  end if;
  update public.bulk_import_jobs job set
    status = 'validated', total_rows = p_total_rows, error_rows = p_error_rows,
    errors = p_errors, processed_rows = 0, started_at = pg_catalog.now(), version = job.version + 1
  where job.id = v_job.id
  returning * into v_job;
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'import.validate', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('job_id', v_job.id, 'version', v_job.version,
      'total_rows', p_total_rows, 'error_rows', p_error_rows)
  );
end;
$$;

create function public.p308_request_import_execution(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_job_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_job public.bulk_import_jobs%rowtype;
  v_event_id uuid;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'import.execute', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  v_job := private.p308_lock_import_job(p_tenant_id, p_company_id, p_job_id);
  if v_job.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  if v_job.status::text <> 'validated' or v_job.artifact_sha256 is null then
    raise exception using errcode = 'P0001', message = 'INVALID_IMPORT_TRANSITION';
  end if;
  v_event_id := private.p308_publish(
    'import:' || v_job.id::text || ':execute',
    'employee.import.requested',
    v_job.tenant_id, v_job.company_id, p_actor_id, p_operation_id,
    pg_catalog.jsonb_build_object('resource_id', v_job.id, 'operation_id', p_operation_id,
      'version', v_job.version + 1)
  );
  update public.bulk_import_jobs job set
    status = 'importing', requested_by = p_actor_id, execution_event_id = v_event_id,
    version = job.version + 1
  where job.id = v_job.id
  returning * into v_job;
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'import.execute', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('job_id', v_job.id, 'version', v_job.version, 'status', 'importing')
  );
end;
$$;

create function public.p308_cancel_import(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_job_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_job public.bulk_import_jobs%rowtype;
  v_state text;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'import.cancel', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  v_job := private.p308_lock_import_job(p_tenant_id, p_company_id, p_job_id);
  if v_job.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  if v_job.status::text in ('uploaded', 'validating', 'validated') then
    update public.bulk_import_jobs job set
      status = 'cancelled', completed_at = pg_catalog.now(), version = job.version + 1
    where job.id = v_job.id returning * into v_job;
    v_state := 'cancelled';
    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (p_tenant_id, p_actor_id, 'cancelled', 'self_serve', pg_catalog.jsonb_build_object(
      'entity', 'employee_import', 'import_job_id', v_job.id, 'company_id', p_company_id,
      'operation_id', p_operation_id));
  elsif v_job.status::text = 'importing' and v_job.cancel_requested_at is null then
    update public.bulk_import_jobs job set
      cancel_requested_at = pg_catalog.now(), version = job.version + 1
    where job.id = v_job.id returning * into v_job;
    v_state := 'cancel_requested';
  else
    raise exception using errcode = 'P0001', message = 'INVALID_IMPORT_TRANSITION';
  end if;
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'import.cancel', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('job_id', v_job.id, 'version', v_job.version, 'status', v_state)
  );
end;
$$;

-- Verifies the P3.10 lease that fences an import execution. Reading the
-- P3.10 job row is consumption of the frozen interface; no P3.10 state is
-- changed here.
create function private.p308_assert_import_lease(
  p_job public.bulk_import_jobs,
  p_worker_id uuid,
  p_lease_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job.execution_event_id is null or not exists (
    select 1 from public.event_jobs job
    where job.event_id = p_job.execution_event_id
      and job.consumer_name = 'p308.employee_import.executor'
      and job.state = 'leased'
      and job.lease_owner = p_worker_id
      and job.lease_token = p_lease_token
      and job.lease_expires_at > pg_catalog.now()
  ) then
    raise exception using errcode = '55000', message = 'STALE_IMPORT_LEASE';
  end if;
end;
$$;

create function public.p308_read_import_execution(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
begin
  select * into v_job from public.bulk_import_jobs where id = p_job_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_FOUND';
  end if;
  perform private.p308_assert_import_lease(v_job, p_worker_id, p_lease_token);
  return pg_catalog.jsonb_build_object(
    'job_id', v_job.id, 'tenant_id', v_job.tenant_id, 'company_id', v_job.company_id,
    'status', v_job.status, 'storage_path', v_job.storage_path,
    'artifact_sha256', v_job.artifact_sha256, 'total_rows', v_job.total_rows,
    'next_row', v_job.next_row, 'next_batch', v_job.next_batch,
    'cancel_requested', v_job.cancel_requested_at is not null
  );
end;
$$;

-- Applies one atomic batch. All rows commit together or not at all; the batch
-- number is the idempotency key, the P3.10 lease token is the fence.
create function public.p308_apply_import_batch(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_batch_no integer,
  p_first_row integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
  v_row jsonb;
  v_row_number integer;
  v_expected_row integer;
  v_employee public.employees%rowtype;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_count integer;
begin
  select * into v_job from public.bulk_import_jobs where id = p_job_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_FOUND';
  end if;
  perform private.p308_assert_import_lease(v_job, p_worker_id, p_lease_token);
  if v_job.status::text <> 'importing' then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_EXECUTING';
  end if;
  if p_batch_no < v_job.next_batch then
    return pg_catalog.jsonb_build_object('state', 'replayed', 'next_row', v_job.next_row,
      'next_batch', v_job.next_batch);
  end if;
  if p_batch_no > v_job.next_batch or p_first_row <> v_job.next_row + 1 then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_OUT_OF_ORDER';
  end if;
  if v_job.cancel_requested_at is not null then
    return pg_catalog.jsonb_build_object('state', 'cancel_requested', 'next_row', v_job.next_row,
      'next_batch', v_job.next_batch);
  end if;
  if not public.authorize_pro_company_access(v_job.requested_by, v_job.tenant_id, v_job.company_id) then
    update public.bulk_import_jobs job set
      status = 'failed', failure_code = 'ASSIGNMENT_RELEASED', completed_at = pg_catalog.now(),
      version = job.version + 1
    where job.id = v_job.id;
    return pg_catalog.jsonb_build_object('state', 'failed', 'failure_code', 'ASSIGNMENT_RELEASED');
  end if;
  v_count := pg_catalog.jsonb_array_length(p_rows);
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' or v_count not between 1 and 100
    or v_job.next_row + v_count > v_job.total_rows
  then
    raise exception using errcode = '22023', message = 'INVALID_IMPORT_BATCH';
  end if;

  v_expected_row := p_first_row;
  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    v_row_number := (v_row->>'row_number')::integer;
    if v_row_number is distinct from v_expected_row then
      raise exception using errcode = '22023', message = 'INVALID_IMPORT_BATCH';
    end if;
    v_expected_row := v_expected_row + 1;
    if v_row->>'outcome' in ('invalid', 'duplicate_in_file') then
      insert into public.bulk_import_row_outcomes (job_id, row_number, batch_no, outcome, error_code)
      values (v_job.id, v_row_number, p_batch_no, v_row->>'outcome', coalesce(v_row->>'error_code', 'ROW_INVALID'));
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_row->>'outcome' is distinct from 'valid' then
      raise exception using errcode = '22023', message = 'INVALID_IMPORT_BATCH';
    end if;
    perform private.p308_validate_employee_payload(v_row->'employee', false);
    v_employee := null;
    insert into public.employees (
      tenant_id, company_id, name, email, phone, nationality, job_title,
      passport_no_encrypted, passport_no_hash, passport_no_last4,
      visa_no_encrypted, visa_no_last4, visa_expiry,
      emirates_id_encrypted, emirates_id_last4, eid_expiry, status
    )
    select v_job.tenant_id, v_job.company_id, pg_catalog.btrim(e->>'name'),
      nullif(pg_catalog.btrim(e->>'email'), ''), nullif(pg_catalog.btrim(e->>'phone'), ''),
      nullif(pg_catalog.btrim(e->>'nationality'), ''), nullif(pg_catalog.btrim(e->>'job_title'), ''),
      e->>'passport_no_encrypted', e->>'passport_no_hash', e->>'passport_no_last4',
      e->>'visa_no_encrypted', e->>'visa_no_last4', (e->>'visa_expiry')::date,
      e->>'emirates_id_encrypted', e->>'emirates_id_last4', (e->>'eid_expiry')::date, 'active'
    from (select v_row->'employee' as e) source
    on conflict (company_id, passport_no_hash) where passport_no_hash is not null do nothing
    returning * into v_employee;
    if v_employee.id is null then
      insert into public.bulk_import_row_outcomes (job_id, row_number, batch_no, outcome, error_code)
      values (v_job.id, v_row_number, p_batch_no, 'duplicate_existing', 'EMPLOYEE_PASSPORT_DUPLICATE');
      v_skipped := v_skipped + 1;
    else
      insert into public.bulk_import_row_outcomes (job_id, row_number, batch_no, outcome, employee_id)
      values (v_job.id, v_row_number, p_batch_no, 'inserted', v_employee.id);
      insert into public.employee_audit_events (
        tenant_id, company_id, employee_id, actor_id, operation_id, action, version,
        changed_fields, import_job_id
      ) values (
        v_employee.tenant_id, v_employee.company_id, v_employee.id, v_job.requested_by,
        v_job.operation_id, 'imported', v_employee.version, array['record'], v_job.id
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.bulk_import_jobs job set
    next_row = job.next_row + v_count,
    next_batch = job.next_batch + 1,
    processed_rows = job.next_row + v_count,
    inserted_rows = job.inserted_rows + v_inserted,
    skipped_rows = job.skipped_rows + v_skipped,
    version = job.version + 1
  where job.id = v_job.id
  returning * into v_job;
  return pg_catalog.jsonb_build_object('state', 'applied', 'next_row', v_job.next_row,
    'next_batch', v_job.next_batch, 'inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

create function public.p308_finalize_import(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
  v_state text;
begin
  select * into v_job from public.bulk_import_jobs where id = p_job_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_FOUND';
  end if;
  perform private.p308_assert_import_lease(v_job, p_worker_id, p_lease_token);
  if v_job.status::text in ('completed', 'cancelled', 'failed') then
    return pg_catalog.jsonb_build_object('state', v_job.status, 'replayed', true);
  end if;
  if v_job.status::text <> 'importing' then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_EXECUTING';
  end if;
  if p_failure_code is not null then
    if p_failure_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
      raise exception using errcode = '22023', message = 'INVALID_IMPORT_FAILURE';
    end if;
    v_state := 'failed';
  elsif v_job.cancel_requested_at is not null then
    v_state := 'cancelled';
  elsif v_job.next_row = v_job.total_rows then
    v_state := 'completed';
  else
    raise exception using errcode = 'P0001', message = 'IMPORT_INCOMPLETE';
  end if;
  update public.bulk_import_jobs job set
    status = v_state::public.bulk_import_status,
    failure_code = p_failure_code,
    error_rows = job.error_rows,
    completed_at = pg_catalog.now(),
    version = job.version + 1
  where job.id = v_job.id
  returning * into v_job;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    v_job.tenant_id, v_job.requested_by,
    case v_state when 'completed' then 'bulk_imported' when 'cancelled' then 'cancelled' else 'updated' end,
    'system',
    pg_catalog.jsonb_build_object(
      'entity', 'employee_import', 'import_job_id', v_job.id, 'company_id', v_job.company_id,
      'state', v_state, 'total', v_job.total_rows, 'processed', v_job.next_row,
      'succeeded', v_job.inserted_rows, 'skipped', v_job.skipped_rows,
      'failure_code', p_failure_code
    )
  );
  perform private.p308_publish(
    'import:' || v_job.id::text || ':finished',
    'employee.import.finished',
    v_job.tenant_id, v_job.company_id, v_job.requested_by, v_job.operation_id,
    pg_catalog.jsonb_build_object('resource_id', v_job.id, 'version', v_job.version, 'state', v_state)
  );
  return pg_catalog.jsonb_build_object('state', v_state, 'replayed', false);
end;
$$;

create function public.p308_list_expired_import_artifacts(p_limit integer)
returns table (job_id uuid, storage_path text, artifact_sha256 text)
language sql
stable
security definer
set search_path = ''
as $$
  select job.id, job.storage_path, job.artifact_sha256
  from public.bulk_import_jobs job
  where job.artifact_deleted_at is null
    and job.retention_expires_at is not null
    and job.retention_expires_at <= pg_catalog.now()
    and job.status in ('completed', 'cancelled', 'failed')
  order by job.retention_expires_at, job.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

create function public.p308_mark_import_artifact_deleted(
  p_job_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.bulk_import_jobs%rowtype;
begin
  select * into v_job from public.bulk_import_jobs where id = p_job_id for update;
  if not found or v_job.artifact_deleted_at is not null
    or v_job.status::text not in ('completed', 'cancelled', 'failed')
    or v_job.retention_expires_at > pg_catalog.now()
  then
    return false;
  end if;
  insert into public.bulk_import_artifact_access (
    job_id, tenant_id, company_id, worker_id, purpose, artifact_sha256
  ) values (v_job.id, v_job.tenant_id, v_job.company_id, p_worker_id, 'cleanup', v_job.artifact_sha256);
  update public.bulk_import_jobs job set artifact_deleted_at = pg_catalog.now(), version = job.version + 1
  where job.id = v_job.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renewals
-- ---------------------------------------------------------------------------

alter table public.renewals drop constraint renewals_type_check;
alter table public.renewals
  add constraint renewals_type_check check (type in (
    'license', 'visa', 'investor_visa', 'eid', 'establishment_card', 'ejari', 'medical_insurance'
  )),
  add column stage text not null default 'due',
  add column version bigint not null default 1,
  add column blocker_code text,
  add column blocked_at timestamptz,
  add column government_fee_minor bigint not null default 0,
  add column pro_service_fee_minor bigint not null default 0,
  add column fine_minor bigint not null default 0,
  add column currency text not null default 'AED',
  add column escalation_level smallint not null default 0,
  add column cancelled_at timestamptz,
  add column cancel_reason text;

update public.renewals set stage = case status
  when 'completed' then 'completed'
  when 'cancelled' then 'cancelled'
  else 'due'
end;

alter table public.renewals
  add constraint renewals_stage_valid check (stage in (
    'due', 'in_progress', 'documents_submitted', 'government_processing', 'completed', 'cancelled'
  )),
  add constraint renewals_stage_status_consistent check (
    (stage = 'completed') = (status = 'completed')
    and (stage = 'cancelled') = (status = 'cancelled')
  ),
  add constraint renewals_version_positive check (version >= 1),
  add constraint renewals_costs_valid check (
    government_fee_minor between 0 and 100000000000
    and pro_service_fee_minor between 0 and 100000000000
    and fine_minor between 0 and 100000000000
    and currency ~ '^[A-Z]{3}$'
  ),
  add constraint renewals_blocker_shape check (
    (blocker_code is null and blocked_at is null)
    or (blocker_code ~ '^[a-z][a-z0-9_]{2,63}$' and blocked_at is not null)
  ),
  add constraint renewals_label_shape check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 160),
  add constraint renewals_escalation_valid check (escalation_level between 0 and 2),
  add constraint renewals_tenant_company_id_key unique (tenant_id, company_id, id);

create unique index renewals_manual_active_uniq
  on public.renewals (
    tenant_id, company_id, type,
    coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), due_date
  )
  where source = 'manual' and stage not in ('cancelled', 'completed');

create index renewals_company_calendar_idx
  on public.renewals (tenant_id, company_id, due_date, id);

-- Keeps legacy writers (the licence/onboarding sync triggers) consistent with
-- the stage model and bumps the optimistic version on every change.
create function private.p308_renewal_row_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.stage = old.stage then
      if new.status in ('completed', 'cancelled') then
        new.stage := new.status;
      elsif old.stage in ('completed', 'cancelled') then
        new.stage := 'due';
      end if;
    end if;
    if new.version = old.version and (
      new.stage, new.status, new.due_date, new.label, new.type, new.employee_id,
      new.government_fee_minor, new.pro_service_fee_minor, new.fine_minor, new.currency,
      new.blocker_code, new.escalation_level, new.completed_at, new.cancelled_at
    ) is distinct from (
      old.stage, old.status, old.due_date, old.label, old.type, old.employee_id,
      old.government_fee_minor, old.pro_service_fee_minor, old.fine_minor, old.currency,
      old.blocker_code, old.escalation_level, old.completed_at, old.cancelled_at
    ) then
      new.version := old.version + 1;
    end if;
  end if;
  if new.stage in ('completed', 'cancelled') then
    new.status := new.stage;
  elsif new.status in ('completed', 'cancelled') then
    new.status := private.p308_legacy_status(new.due_date, new.stage);
  end if;
  return new;
end;
$$;

create function private.p308_legacy_status(p_due date, p_stage text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_stage in ('completed', 'cancelled') then p_stage
    when p_due < private.p308_dubai_today() then 'overdue'
    when p_due - private.p308_dubai_today() <= 30 then 'due_soon'
    else 'upcoming'
  end;
$$;

create trigger p308_renewal_row_guard
  before insert or update on public.renewals
  for each row execute function private.p308_renewal_row_guard();

create table public.renewal_stage_events (
  id uuid primary key default gen_random_uuid(),
  renewal_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  operation_id uuid,
  batch_operation_id uuid,
  action text not null,
  from_stage text,
  to_stage text not null,
  version bigint not null,
  reason_code text,
  details jsonb not null default '{}',
  created_at timestamptz not null default pg_catalog.now(),
  constraint renewal_stage_event_action_valid check (action in (
    'created', 'updated', 'transitioned', 'blocked', 'unblocked', 'evidence_linked',
    'completed', 'cancelled', 'escalated'
  )),
  constraint renewal_stage_event_reason_shape check (
    reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint renewal_stage_event_details_object check (pg_catalog.jsonb_typeof(details) = 'object'),
  constraint renewal_stage_event_renewal_fk foreign key (tenant_id, company_id, renewal_id)
    references public.renewals (tenant_id, company_id, id) on delete restrict
);
create index renewal_stage_events_renewal_idx
  on public.renewal_stage_events (tenant_id, company_id, renewal_id, created_at, id);
create trigger renewal_stage_events_immutable
  before update or delete on public.renewal_stage_events
  for each row execute function private.p308_reject_mutation();

create table public.renewal_evidence (
  renewal_id uuid not null,
  document_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  linked_by uuid references public.profiles(id) on delete set null,
  operation_id uuid,
  linked_at timestamptz not null default pg_catalog.now(),
  primary key (renewal_id, document_id),
  constraint renewal_evidence_renewal_fk foreign key (tenant_id, company_id, renewal_id)
    references public.renewals (tenant_id, company_id, id) on delete restrict,
  constraint renewal_evidence_document_fk foreign key (tenant_id, company_id, document_id)
    references public.documents (tenant_id, company_id, id) on delete restrict
);
create trigger renewal_evidence_immutable
  before update or delete on public.renewal_evidence
  for each row execute function private.p308_reject_mutation();

create table public.renewal_reminder_jobs (
  renewal_id uuid not null references public.renewals(id) on delete restrict,
  renewal_version bigint not null,
  window_days integer not null,
  remind_at timestamptz not null,
  event_id uuid not null references public.domain_events(id) on delete restrict,
  job_id uuid references public.event_jobs(id) on delete restrict,
  state text not null default 'scheduled',
  superseded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (renewal_id, renewal_version, window_days),
  constraint renewal_reminder_state_valid check (state in ('scheduled', 'superseded')),
  constraint renewal_reminder_superseded_shape check ((state = 'superseded') = (superseded_at is not null))
);
create index renewal_reminder_jobs_active_idx
  on public.renewal_reminder_jobs (renewal_id) where state = 'scheduled';

create table public.renewal_materialization_runs (
  id uuid primary key default gen_random_uuid(),
  dubai_date date not null,
  status_changes integer not null,
  attention_events integer not null,
  escalations integer not null,
  active_renewals integer not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default pg_catalog.now()
);
create index renewal_materialization_runs_recent_idx
  on public.renewal_materialization_runs (finished_at desc);

create function private.p308_reminder_offsets(p_type text)
returns integer[]
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_type
    when 'license' then array[90, 60, 30, 14, 7, 3, 1, 0]
    when 'visa' then array[90, 60, 30, 14, 7, 3, 1, 0]
    when 'investor_visa' then array[90, 60, 30, 14, 7, 3, 1, 0]
    when 'eid' then array[90, 60, 30, 14, 7, 3, 1, 0]
    when 'establishment_card' then array[60, 30, 14, 7, 0]
    when 'ejari' then array[90, 60, 30, 0]
    when 'medical_insurance' then array[60, 30, 14, 0]
    else array[30, 7, 1, 0]
  end;
$$;

create function private.p308_dubai_instant(p_date date)
returns timestamptz
language sql
immutable
security definer
set search_path = ''
as $$
  select (p_date::text || ' 08:00:00')::timestamp at time zone 'Asia/Dubai';
$$;

-- Supersedes the previous reminder generation and publishes the current one.
-- Recipients, consent and channel availability are resolved by P3.10 when
-- the job is claimed; the payload carries references only.
create function private.p308_schedule_renewal_reminders(
  p_renewal public.renewals,
  p_actor_id uuid,
  p_operation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_offset integer;
  v_remind_at timestamptz;
  v_event_id uuid;
  v_job_id uuid;
  v_count integer := 0;
  v_notify timestamptz[] := '{}';
begin
  for v_old in
    select reminder.renewal_version, reminder.window_days, reminder.job_id
    from public.renewal_reminder_jobs reminder
    where reminder.renewal_id = p_renewal.id and reminder.state = 'scheduled'
    for update
  loop
    if v_old.job_id is not null then
      perform public.cancel_event_job(v_old.job_id, 'RENEWAL_REMINDER_SUPERSEDED');
    end if;
    update public.renewal_reminder_jobs reminder
    set state = 'superseded', superseded_at = pg_catalog.now()
    where reminder.renewal_id = p_renewal.id
      and reminder.renewal_version = v_old.renewal_version
      and reminder.window_days = v_old.window_days;
  end loop;

  if p_renewal.stage not in ('completed', 'cancelled') then
    foreach v_offset in array private.p308_reminder_offsets(p_renewal.type) loop
      v_remind_at := private.p308_dubai_instant(p_renewal.due_date - v_offset);
      continue when v_remind_at <= pg_catalog.now();
      v_event_id := private.p308_publish(
        'renewal:' || p_renewal.id::text || ':version:' || p_renewal.version::text ||
          ':window:' || v_offset::text,
        'renewal.reminder.scheduled',
        p_renewal.tenant_id, p_renewal.company_id, p_actor_id, p_operation_id,
        pg_catalog.jsonb_build_object(
          'resource_id', p_renewal.id, 'version', p_renewal.version,
          'window_days', v_offset, 'stage', p_renewal.stage
        )
      );
      -- P3.10 v1.0.0 publish has no availability argument; defer only the job
      -- this transaction just created for P3.08's reminder consumer.
      update public.event_jobs job
      set available_at = v_remind_at, updated_at = pg_catalog.now()
      where job.event_id = v_event_id
        and job.consumer_name = 'internal.renewal_reminder.delivery'
        and job.state = 'pending'
        and job.replay_of_job_id is null
      returning job.id into v_job_id;
      insert into public.renewal_reminder_jobs (
        renewal_id, renewal_version, window_days, remind_at, event_id, job_id
      ) values (p_renewal.id, p_renewal.version, v_offset, v_remind_at, v_event_id, v_job_id);
      v_notify := v_notify || v_remind_at;
      v_count := v_count + 1;
    end loop;
  end if;
  update public.renewals renewal
  set notify_at = (select coalesce(pg_catalog.array_agg(t order by t), '{}') from pg_catalog.unnest(v_notify) t)
  where renewal.id = p_renewal.id;
  return v_count;
end;
$$;

create function private.p308_renewal_event(
  p_renewal public.renewals,
  p_actor_id uuid,
  p_operation_id uuid,
  p_batch_operation_id uuid,
  p_action text,
  p_from_stage text,
  p_reason_code text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.renewal_stage_events (
    renewal_id, tenant_id, company_id, actor_id, operation_id, batch_operation_id,
    action, from_stage, to_stage, version, reason_code, details
  ) values (
    p_renewal.id, p_renewal.tenant_id, p_renewal.company_id, p_actor_id, p_operation_id,
    p_batch_operation_id, p_action, p_from_stage, p_renewal.stage, p_renewal.version,
    p_reason_code, coalesce(p_details, '{}')
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_renewal.tenant_id, p_actor_id,
    case p_action when 'created' then 'created' when 'completed' then 'completed'
      when 'cancelled' then 'cancelled' else 'updated' end,
    'self_serve',
    pg_catalog.jsonb_build_object(
      'entity', 'renewal', 'op', p_action, 'renewal_id', p_renewal.id,
      'company_id', p_renewal.company_id, 'operation_id', p_operation_id,
      'batch_operation_id', p_batch_operation_id, 'from_stage', p_from_stage,
      'to_stage', p_renewal.stage, 'version', p_renewal.version
    )
  );
  perform private.p308_publish(
    'renewal:' || p_renewal.id::text || ':version:' || p_renewal.version::text,
    'renewal.lifecycle.changed',
    p_renewal.tenant_id, p_renewal.company_id, p_actor_id, coalesce(p_batch_operation_id, p_operation_id),
    pg_catalog.jsonb_build_object(
      'resource_id', p_renewal.id,
      'operation_id', coalesce(p_operation_id, p_batch_operation_id),
      'version', p_renewal.version, 'stage', p_renewal.stage, 'change', p_action
    )
  );
end;
$$;

create function private.p308_validate_costs(p_costs jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_costs is null then return; end if;
  if pg_catalog.jsonb_typeof(p_costs) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_COSTS';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_costs) loop
    if v_key not in ('government_fee_minor', 'pro_service_fee_minor', 'fine_minor', 'currency') then
      raise exception using errcode = '22023', message = 'INVALID_RENEWAL_COSTS';
    end if;
    if v_key = 'currency' then
      if coalesce(p_costs->>'currency', '') !~ '^[A-Z]{3}$' then
        raise exception using errcode = '22023', message = 'INVALID_RENEWAL_COSTS';
      end if;
    elsif pg_catalog.jsonb_typeof(p_costs->v_key) <> 'number'
      or (p_costs->>v_key) !~ '^[0-9]{1,12}$'
    then
      raise exception using errcode = '22023', message = 'INVALID_RENEWAL_COSTS';
    end if;
  end loop;
end;
$$;

create function public.p308_create_renewal(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_renewal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_renewal public.renewals%rowtype;
  v_employee_id uuid;
  v_costs jsonb := coalesce(p_renewal->'costs', '{}');
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'renewal.create', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if pg_catalog.jsonb_typeof(p_renewal) <> 'object'
    or coalesce(p_renewal->>'type', '') not in (
      'license', 'visa', 'investor_visa', 'eid', 'establishment_card', 'ejari', 'medical_insurance')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_renewal->>'label', ''))) not between 1 and 160
    or coalesce(p_renewal->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_PAYLOAD';
  end if;
  perform private.p308_validate_costs(v_costs);
  if p_renewal->>'employee_id' is not null then
    v_employee_id := (p_renewal->>'employee_id')::uuid;
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id and employee.tenant_id = p_tenant_id
        and employee.company_id = p_company_id
    ) then
      raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
    end if;
  end if;
  begin
    insert into public.renewals (
      tenant_id, company_id, employee_id, type, label, due_date, source, stage, status,
      government_fee_minor, pro_service_fee_minor, fine_minor, currency
    ) values (
      p_tenant_id, p_company_id, v_employee_id, p_renewal->>'type',
      pg_catalog.btrim(p_renewal->>'label'), (p_renewal->>'due_date')::date, 'manual', 'due',
      private.p308_legacy_status((p_renewal->>'due_date')::date, 'due'),
      coalesce((v_costs->>'government_fee_minor')::bigint, 0),
      coalesce((v_costs->>'pro_service_fee_minor')::bigint, 0),
      coalesce((v_costs->>'fine_minor')::bigint, 0),
      coalesce(v_costs->>'currency', 'AED')
    )
    returning * into v_renewal;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'RENEWAL_DUPLICATE';
  end;
  perform private.p308_renewal_event(v_renewal, p_actor_id, p_operation_id, null, 'created', null, null, '{}');
  perform private.p308_schedule_renewal_reminders(v_renewal, p_actor_id, p_operation_id);
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'renewal.create', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('renewal_id', v_renewal.id, 'version', v_renewal.version)
  );
end;
$$;

create function public.p308_update_renewal(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_renewal_id uuid,
  p_expected_version bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_renewal public.renewals%rowtype;
  v_key text;
  v_costs jsonb;
  v_action text := 'updated';
  v_reschedule boolean;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'renewal.update', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if pg_catalog.jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_PAYLOAD';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_patch) loop
    if v_key not in ('label', 'due_date', 'costs', 'blocker_code') then
      raise exception using errcode = '22023', message = 'INVALID_RENEWAL_PAYLOAD';
    end if;
  end loop;
  if (p_patch ? 'label' and pg_catalog.char_length(pg_catalog.btrim(coalesce(p_patch->>'label', ''))) not between 1 and 160)
    or (p_patch ? 'due_date' and coalesce(p_patch->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$')
    or (p_patch->>'blocker_code' is not null and p_patch->>'blocker_code' !~ '^[a-z][a-z0-9_]{2,63}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_PAYLOAD';
  end if;
  v_costs := p_patch->'costs';
  perform private.p308_validate_costs(v_costs);

  select * into v_renewal from public.renewals renewal
  where renewal.id = p_renewal_id and renewal.tenant_id = p_tenant_id
    and renewal.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RENEWAL_NOT_FOUND';
  end if;
  if v_renewal.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  if v_renewal.stage in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'RENEWAL_TERMINAL';
  end if;
  if p_patch ? 'due_date' and v_renewal.source <> 'manual' then
    raise exception using errcode = 'P0001', message = 'RENEWAL_LICENSE_LOCKED';
  end if;
  if p_patch ? 'blocker_code' then
    v_action := case when p_patch->>'blocker_code' is null then 'unblocked' else 'blocked' end;
  end if;
  v_reschedule := p_patch ? 'due_date' and (p_patch->>'due_date')::date <> v_renewal.due_date;

  update public.renewals renewal set
    label = case when p_patch ? 'label' then pg_catalog.btrim(p_patch->>'label') else renewal.label end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else renewal.due_date end,
    status = case when p_patch ? 'due_date'
      then private.p308_legacy_status((p_patch->>'due_date')::date, renewal.stage) else renewal.status end,
    escalation_level = case when v_reschedule then 0 else renewal.escalation_level end,
    government_fee_minor = coalesce((v_costs->>'government_fee_minor')::bigint, renewal.government_fee_minor),
    pro_service_fee_minor = coalesce((v_costs->>'pro_service_fee_minor')::bigint, renewal.pro_service_fee_minor),
    fine_minor = coalesce((v_costs->>'fine_minor')::bigint, renewal.fine_minor),
    currency = coalesce(v_costs->>'currency', renewal.currency),
    blocker_code = case when p_patch ? 'blocker_code' then p_patch->>'blocker_code' else renewal.blocker_code end,
    blocked_at = case when p_patch ? 'blocker_code'
      then case when p_patch->>'blocker_code' is null then null else pg_catalog.now() end
      else renewal.blocked_at end,
    version = renewal.version + 1
  where renewal.id = v_renewal.id
  returning * into v_renewal;

  perform private.p308_renewal_event(
    v_renewal, p_actor_id, p_operation_id, null, v_action, v_renewal.stage,
    case when v_action = 'blocked' then v_renewal.blocker_code else null end,
    pg_catalog.jsonb_build_object('fields', (select pg_catalog.jsonb_agg(k order by k) from pg_catalog.jsonb_object_keys(p_patch) k))
  );
  if p_patch ? 'due_date' then
    perform private.p308_schedule_renewal_reminders(v_renewal, p_actor_id, p_operation_id);
  end if;
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'renewal.update', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('renewal_id', v_renewal.id, 'version', v_renewal.version)
  );
end;
$$;

-- One guarded stage transition on an already locked row.
create function private.p308_apply_renewal_transition(
  p_renewal public.renewals,
  p_actor_id uuid,
  p_operation_id uuid,
  p_batch_operation_id uuid,
  p_to_stage text,
  p_evidence uuid[],
  p_reason_code text
)
returns public.renewals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text := p_renewal.stage;
  v_document uuid;
  v_renewal public.renewals%rowtype;
  v_action text;
begin
  if v_from in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'RENEWAL_TERMINAL';
  end if;
  if not (
    (v_from = 'due' and p_to_stage = 'in_progress')
    or (v_from = 'in_progress' and p_to_stage = 'documents_submitted')
    or (v_from = 'documents_submitted' and p_to_stage in ('government_processing', 'in_progress'))
    or (v_from = 'government_processing' and p_to_stage in ('completed', 'documents_submitted'))
    or p_to_stage = 'cancelled'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RENEWAL_TRANSITION';
  end if;
  if p_to_stage = 'cancelled' then
    if p_reason_code is null or p_reason_code !~ '^[a-z][a-z0-9_]{2,63}$' then
      raise exception using errcode = '22023', message = 'RENEWAL_REASON_REQUIRED';
    end if;
    if p_renewal.source <> 'manual' then
      raise exception using errcode = 'P0001', message = 'RENEWAL_LICENSE_LOCKED';
    end if;
  elsif p_renewal.blocker_code is not null then
    raise exception using errcode = 'P0001', message = 'RENEWAL_BLOCKED';
  end if;

  if p_evidence is not null then
    foreach v_document in array p_evidence loop
      if not exists (
        select 1 from public.documents document
        where document.id = v_document and document.tenant_id = p_renewal.tenant_id
          and document.company_id = p_renewal.company_id
          and exists (
            select 1 from public.document_versions version
            where version.document_id = document.id and version.tenant_id = document.tenant_id
          )
      ) then
        raise exception using errcode = 'P0001', message = 'RENEWAL_EVIDENCE_NOT_FOUND';
      end if;
      insert into public.renewal_evidence (
        renewal_id, document_id, tenant_id, company_id, linked_by, operation_id
      ) values (
        p_renewal.id, v_document, p_renewal.tenant_id, p_renewal.company_id, p_actor_id,
        coalesce(p_operation_id, p_batch_operation_id)
      ) on conflict (renewal_id, document_id) do nothing;
    end loop;
  end if;
  if p_to_stage in ('documents_submitted', 'completed') and not exists (
    select 1 from public.renewal_evidence evidence where evidence.renewal_id = p_renewal.id
  ) then
    raise exception using errcode = 'P0001', message = 'RENEWAL_EVIDENCE_REQUIRED';
  end if;

  update public.renewals renewal set
    stage = p_to_stage,
    status = private.p308_legacy_status(renewal.due_date, p_to_stage),
    completed_at = case when p_to_stage = 'completed' then pg_catalog.now() else null end,
    cancelled_at = case when p_to_stage = 'cancelled' then pg_catalog.now() else null end,
    cancel_reason = case when p_to_stage = 'cancelled' then p_reason_code else null end,
    version = renewal.version + 1
  where renewal.id = p_renewal.id
  returning * into v_renewal;

  v_action := case p_to_stage when 'completed' then 'completed' when 'cancelled' then 'cancelled'
    else 'transitioned' end;
  perform private.p308_renewal_event(
    v_renewal, p_actor_id, p_operation_id, p_batch_operation_id, v_action, v_from, p_reason_code,
    pg_catalog.jsonb_build_object('evidence_count', coalesce(pg_catalog.cardinality(p_evidence), 0))
  );
  perform private.p308_schedule_renewal_reminders(v_renewal, p_actor_id, coalesce(p_operation_id, p_batch_operation_id));
  return v_renewal;
end;
$$;

create function public.p308_transition_renewal(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_renewal_id uuid,
  p_expected_version bigint,
  p_to_stage text,
  p_evidence_document_ids uuid[],
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_renewal public.renewals%rowtype;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'renewal.transition', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if coalesce(pg_catalog.cardinality(p_evidence_document_ids), 0) > 20 then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_PAYLOAD';
  end if;
  select * into v_renewal from public.renewals renewal
  where renewal.id = p_renewal_id and renewal.tenant_id = p_tenant_id
    and renewal.company_id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RENEWAL_NOT_FOUND';
  end if;
  if v_renewal.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION';
  end if;
  v_renewal := private.p308_apply_renewal_transition(
    v_renewal, p_actor_id, p_operation_id, null, p_to_stage, p_evidence_document_ids, p_reason_code
  );
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'renewal.transition', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('renewal_id', v_renewal.id, 'version', v_renewal.version,
      'stage', v_renewal.stage)
  );
end;
$$;

-- All-or-nothing batch transition. Rows are locked in id order to avoid
-- deadlocks between overlapping batches.
create function public.p308_batch_transition_renewals(
  p_actor_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_items jsonb,
  p_to_stage text,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_item record;
  v_renewal public.renewals%rowtype;
  v_results jsonb := '[]';
  v_count integer;
begin
  v_replay := private.p308_receipt_lookup(p_actor_id, p_operation_id, 'renewal.batch', p_payload_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.p308_resolve_actor(p_actor_id, p_tenant_id, p_company_id, array['pro']);
  if pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_BATCH';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_items);
  if v_count not between 1 and 100
    or p_to_stage not in ('in_progress', 'government_processing', 'cancelled')
    or (select count(distinct value->>'renewal_id') from pg_catalog.jsonb_array_elements(p_items)) <> v_count
  then
    raise exception using errcode = '22023', message = 'INVALID_RENEWAL_BATCH';
  end if;
  for v_item in
    select (value->>'renewal_id')::uuid as renewal_id, (value->>'expected_version')::bigint as expected_version
    from pg_catalog.jsonb_array_elements(p_items)
    order by (value->>'renewal_id')::uuid
  loop
    select * into v_renewal from public.renewals renewal
    where renewal.id = v_item.renewal_id and renewal.tenant_id = p_tenant_id
      and renewal.company_id = p_company_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'RENEWAL_NOT_FOUND';
    end if;
    if v_renewal.version <> v_item.expected_version then
      raise exception using errcode = 'P0001', message = 'STALE_VERSION';
    end if;
    v_renewal := private.p308_apply_renewal_transition(
      v_renewal, p_actor_id, null, p_operation_id, p_to_stage, null, p_reason_code
    );
    v_results := v_results || pg_catalog.jsonb_build_object(
      'renewal_id', v_renewal.id, 'version', v_renewal.version, 'stage', v_renewal.stage);
  end loop;
  return private.p308_receipt_store(
    p_actor_id, p_operation_id, 'renewal.batch', p_payload_hash, p_tenant_id,
    pg_catalog.jsonb_build_object('count', v_count, 'items', v_results)
  );
end;
$$;

-- Nightly materialization. Dubai business date, explicit health row and
-- daily attention events (overdue: day of + daily; escalation: a 30-day
-- window passed with no action raises the level and daily frequency).
-- The cron schedule itself stays owned by P3.10.
create or replace function public.recompute_renewal_status()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_today date := private.p308_dubai_today();
  v_changes integer;
  v_events integer := 0;
  v_escalations integer := 0;
  v_active integer;
  v_row record;
begin
  update public.renewals renewal
  set status = private.p308_legacy_status(renewal.due_date, renewal.stage),
      version = renewal.version + 1
  where renewal.stage not in ('completed', 'cancelled')
    and renewal.status is distinct from private.p308_legacy_status(renewal.due_date, renewal.stage);
  get diagnostics v_changes = row_count;

  for v_row in
    select renewal.* from public.renewals renewal
    where renewal.stage = 'due' and renewal.escalation_level = 0
      and renewal.due_date - v_today <= 30
    for update
  loop
    update public.renewals renewal set escalation_level = 1, version = renewal.version + 1
    where renewal.id = v_row.id;
    insert into public.renewal_stage_events (
      renewal_id, tenant_id, company_id, action, from_stage, to_stage, version, reason_code
    ) values (v_row.id, v_row.tenant_id, v_row.company_id, 'escalated', v_row.stage, v_row.stage,
      v_row.version + 1, 'no_action_after_30_day_reminder');
    v_escalations := v_escalations + 1;
  end loop;

  for v_row in
    select renewal.* from public.renewals renewal
    where renewal.stage not in ('completed', 'cancelled')
      and (renewal.due_date <= v_today or renewal.escalation_level > 0)
  loop
    perform private.p308_publish(
      'renewal:' || v_row.id::text || ':attention:' || v_today::text,
      'renewal.attention.daily',
      v_row.tenant_id, v_row.company_id, null, null,
      pg_catalog.jsonb_build_object(
        'resource_id', v_row.id, 'version', v_row.version,
        'days_remaining', v_row.due_date - v_today,
        'state', case when v_row.due_date < v_today then 'overdue'
          when v_row.due_date = v_today then 'due_today' else 'escalated' end
      )
    );
    v_events := v_events + 1;
  end loop;

  select count(*) into v_active from public.renewals where stage not in ('completed', 'cancelled');
  insert into public.renewal_materialization_runs (
    dubai_date, status_changes, attention_events, escalations, active_renewals, started_at
  ) values (v_today, v_changes, v_events, v_escalations, v_active, v_started);
end;
$$;

create function public.p308_read_renewal_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'dubai_today', private.p308_dubai_today(),
    'last_run', (
      select pg_catalog.jsonb_build_object(
        'dubai_date', run.dubai_date, 'finished_at', run.finished_at,
        'status_changes', run.status_changes, 'attention_events', run.attention_events,
        'escalations', run.escalations, 'active_renewals', run.active_renewals)
      from public.renewal_materialization_runs run
      order by run.finished_at desc limit 1
    ),
    'stale', coalesce((
      select run.dubai_date < private.p308_dubai_today()
      from public.renewal_materialization_runs run order by run.finished_at desc limit 1
    ), true),
    'scheduled_reminders', (
      select count(*) from public.renewal_reminder_jobs where state = 'scheduled'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- P3.10 event registrations (reference-only payloads)
-- ---------------------------------------------------------------------------

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('employee.record.changed', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","change":"state"}'),
  ('employee.import.requested', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer"}'),
  ('employee.import.finished', 1, '{"resource_id":"uuid","version":"integer","state":"state"}'),
  ('renewal.lifecycle.changed', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","stage":"state","change":"state"}'),
  ('renewal.reminder.scheduled', 1, '{"resource_id":"uuid","version":"integer","window_days":"integer","stage":"state"}'),
  ('renewal.attention.daily', 1, '{"resource_id":"uuid","version":"integer","days_remaining":"integer","state":"state"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled
) values
  ('internal.employee_renewal.projection', 'employee.record.changed', 1, 5, 120, true),
  ('internal.employee_renewal.projection', 'employee.import.finished', 1, 5, 120, true),
  ('internal.employee_renewal.projection', 'renewal.lifecycle.changed', 1, 5, 120, true),
  ('p308.employee_import.executor', 'employee.import.requested', 1, 5, 300, true),
  ('internal.renewal_reminder.delivery', 'renewal.reminder.scheduled', 1, 5, 120, true),
  ('internal.renewal_reminder.delivery', 'renewal.attention.daily', 1, 5, 120, true);

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

alter table public.p308_operation_receipts enable row level security;
alter table public.employee_audit_events enable row level security;
alter table public.bulk_import_row_outcomes enable row level security;
alter table public.bulk_import_artifact_access enable row level security;
alter table public.renewal_stage_events enable row level security;
alter table public.renewal_evidence enable row level security;
alter table public.renewal_reminder_jobs enable row level security;
alter table public.renewal_materialization_runs enable row level security;

revoke all on table public.p308_operation_receipts from anon, authenticated;
revoke all on table public.employee_audit_events from anon, authenticated;
revoke all on table public.bulk_import_row_outcomes from anon, authenticated;
revoke all on table public.bulk_import_artifact_access from anon, authenticated;
revoke all on table public.renewal_stage_events from anon, authenticated;
revoke all on table public.renewal_evidence from anon, authenticated;
revoke all on table public.renewal_reminder_jobs from anon, authenticated;
revoke all on table public.renewal_materialization_runs from anon, authenticated;

grant select on table public.employee_audit_events, public.bulk_import_row_outcomes,
  public.renewal_stage_events, public.renewal_evidence, public.renewal_reminder_jobs,
  public.renewal_materialization_runs to service_role;
revoke insert, update, delete, truncate on table public.p308_operation_receipts,
  public.employee_audit_events, public.bulk_import_row_outcomes, public.bulk_import_artifact_access,
  public.renewal_stage_events, public.renewal_evidence, public.renewal_reminder_jobs,
  public.renewal_materialization_runs from service_role;
grant select on table public.bulk_import_artifact_access to service_role;

-- Direct writes to the owned domain tables now flow only through the RPCs.
-- employees keeps service_role DML for the P3.02-owned admin user
-- create/edit identity link; its version guard trigger still fences them.
revoke insert, update, delete on table public.employees from anon, authenticated;
revoke insert, update, delete on table public.renewals from anon, authenticated, service_role;
revoke insert, update, delete on table public.bulk_import_jobs from anon, authenticated, service_role;
revoke insert, update, delete on table public.employee_notification_preferences from anon, authenticated, service_role;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private.p308_dubai_date(timestamp with time zone)',
    'private.p308_dubai_today()',
    'private.p308_reject_mutation()',
    'private.p308_event_uuid(text)',
    'private.p308_publish(text,text,uuid,uuid,uuid,uuid,jsonb)',
    'private.p308_resolve_actor(uuid,uuid,uuid,text[])',
    'private.p308_receipt_lookup(uuid,uuid,text,text)',
    'private.p308_receipt_store(uuid,uuid,text,text,uuid,jsonb)',
    'private.p308_employee_event(public.employees,uuid,uuid,text,text[],text,text)',
    'private.p308_validate_employee_payload(jsonb,boolean)',
    'private.p308_lock_import_job(uuid,uuid,uuid)',
    'private.p308_assert_import_lease(public.bulk_import_jobs,uuid,uuid)',
    'private.p308_renewal_row_guard()',
    'private.p308_employee_version_guard()',
    'private.p308_legacy_status(date,text)',
    'private.p308_reminder_offsets(text)',
    'private.p308_dubai_instant(date)',
    'private.p308_schedule_renewal_reminders(public.renewals,uuid,uuid)',
    'private.p308_renewal_event(public.renewals,uuid,uuid,uuid,text,text,text,jsonb)',
    'private.p308_validate_costs(jsonb)',
    'private.p308_apply_renewal_transition(public.renewals,uuid,uuid,uuid,text,uuid[],text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
  end loop;

  foreach v_signature in array array[
    'public.p308_create_employee(uuid,uuid,text,uuid,uuid,jsonb)',
    'public.p308_update_employee(uuid,uuid,text,uuid,uuid,uuid,bigint,jsonb)',
    'public.p308_set_employee_status(uuid,uuid,text,uuid,uuid,uuid,bigint,text)',
    'public.p308_update_employee_self(uuid,uuid,text,uuid,bigint,jsonb)',
    'public.p308_register_import(uuid,uuid,text,uuid,uuid,uuid,text,text,integer)',
    'public.p308_record_import_artifact_access(uuid,uuid,uuid,text,text)',
    'public.p308_record_import_validation(uuid,uuid,text,uuid,uuid,uuid,bigint,integer,integer,jsonb)',
    'public.p308_request_import_execution(uuid,uuid,text,uuid,uuid,uuid,bigint)',
    'public.p308_cancel_import(uuid,uuid,text,uuid,uuid,uuid,bigint)',
    'public.p308_read_import_execution(uuid,uuid,uuid)',
    'public.p308_apply_import_batch(uuid,uuid,uuid,integer,integer,jsonb)',
    'public.p308_finalize_import(uuid,uuid,uuid,text)',
    'public.p308_list_expired_import_artifacts(integer)',
    'public.p308_mark_import_artifact_deleted(uuid,uuid)',
    'public.p308_create_renewal(uuid,uuid,text,uuid,uuid,jsonb)',
    'public.p308_update_renewal(uuid,uuid,text,uuid,uuid,uuid,bigint,jsonb)',
    'public.p308_transition_renewal(uuid,uuid,text,uuid,uuid,uuid,bigint,text,uuid[],text)',
    'public.p308_batch_transition_renewals(uuid,uuid,text,uuid,uuid,jsonb,text,text)',
    'public.p308_read_renewal_health()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

revoke all on function public.recompute_renewal_status() from public, anon, authenticated;

commit;
