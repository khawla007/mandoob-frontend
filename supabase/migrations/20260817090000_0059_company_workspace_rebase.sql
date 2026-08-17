-- Rebase tenant ownership around one legal company and an assignment ledger.
begin;

alter type public.client_status rename to company_status;
alter table public.clients rename to company_profiles;
-- Approved development-only clean rebase: never reuse this TRUNCATE in a
-- production migration that must preserve existing data.
-- CASCADE clears every dependent ownership row before the one-company constraint,
-- avoiding orphaned foreign keys and enum-cast failures from legacy client jobs.
truncate table public.company_profiles cascade;
alter table public.company_profiles drop column assigned_pro_profile_id;
alter table public.company_profiles
  add constraint company_profiles_one_per_tenant unique (tenant_id);

alter table public.employees rename column client_id to company_id;
alter table public.customer_profiles rename column linked_client_id to linked_company_id;
alter table public.document_requests rename column client_id to company_id;
alter table public.documents rename column client_id to company_id;
alter table public.renewals rename column client_id to company_id;
alter table public.invoices rename column client_id to company_id;
alter table public.meetings rename column client_id to company_id;
alter table public.service_cases rename column client_id to company_id;
alter table public.leads rename column converted_client_id to converted_company_id;
alter table public.bulk_import_jobs rename column parent_client_id to company_id;

drop index if exists public.profiles_one_pro_per_tenant;
alter table public.profiles drop constraint if exists profiles_tenant_required;
alter table public.profiles add constraint profiles_tenant_required check (
  (role in ('super_admin', 'admin') and tenant_id is null)
  or role = 'pro'
  or (role in ('customer', 'employee') and tenant_id is not null)
);

create type public.pro_company_assignment_status as enum ('active', 'released');

create table public.pro_company_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  pro_profile_id uuid not null references public.profiles(id) on delete restrict,
  status public.pro_company_assignment_status not null default 'active',
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete restrict,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint assignment_release_shape check (
    (status = 'active' and released_at is null and released_by is null and release_reason is null)
    or
    (status = 'released' and released_at is not null and released_by is not null
      and char_length(trim(release_reason)) between 3 and 500)
  )
);

create unique index pro_company_assignments_one_active_company
  on public.pro_company_assignments(company_id)
  where status = 'active';
create unique index pro_company_assignments_one_active_pro
  on public.pro_company_assignments(pro_profile_id)
  where status = 'active';
create index pro_company_assignments_history
  on public.pro_company_assignments(company_id, assigned_at desc, id desc);

alter table public.pro_company_assignments enable row level security;
revoke update, delete on public.pro_company_assignments from public, anon, authenticated;

-- Active assignment state is authoritative. Assignment lifecycle RPCs release the
-- ledger row before clearing profile scope, so incompatible direct profile updates
-- must fail instead of silently stranding an active assignment.
create or replace function public.guard_active_pro_company_assignment_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.pro_company_assignments as assignment
    where assignment.pro_profile_id = old.id
      and assignment.status = 'active'
      and (
        new.role is distinct from 'pro'
        or new.status is distinct from 'active'
        or new.tenant_id is distinct from assignment.tenant_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'ACTIVE_PRO_COMPANY_ASSIGNMENT';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_active_pro_company_assignment_transition()
  from public, anon, authenticated;

create trigger profiles_guard_active_company_assignment
  before update of role, status, tenant_id on public.profiles
  for each row
  execute function public.guard_active_pro_company_assignment_transition();

-- Development seed data is disposable. Only employee imports survive the rebase.
delete from public.bulk_import_jobs where kind = 'clients';
alter table public.bulk_import_jobs
  drop constraint bulk_import_jobs_parent_client_required;
alter type public.bulk_import_kind rename to bulk_import_kind_old;
create type public.bulk_import_kind as enum ('employees');
alter table public.bulk_import_jobs
  alter column kind type public.bulk_import_kind
  using kind::text::public.bulk_import_kind;
drop type public.bulk_import_kind_old;
alter table public.bulk_import_jobs
  add constraint bulk_import_jobs_company_required
  check (kind = 'employees' and company_id is not null);

-- Rename current database objects so introspection exposes company terminology.
alter table public.company_profiles rename constraint clients_pkey to company_profiles_pkey;
alter table public.company_profiles
  rename constraint clients_tenant_id_fkey to company_profiles_tenant_id_fkey;
alter table public.employees
  rename constraint employees_client_id_fkey to employees_company_id_fkey;
alter table public.customer_profiles
  rename constraint customer_profiles_linked_client_id_fkey
  to customer_profiles_linked_company_id_fkey;
alter table public.document_requests
  rename constraint document_requests_client_id_fkey to document_requests_company_id_fkey;
alter table public.documents
  rename constraint documents_client_id_fkey to documents_company_id_fkey;
alter table public.renewals
  rename constraint renewals_client_id_fkey to renewals_company_id_fkey;
alter table public.invoices
  rename constraint invoices_client_id_fkey to invoices_company_id_fkey;
alter table public.meetings
  rename constraint meetings_client_id_fkey to meetings_company_id_fkey;
alter table public.leads
  rename constraint leads_converted_client_id_fkey to leads_converted_company_id_fkey;
alter table public.bulk_import_jobs
  rename constraint bulk_import_jobs_parent_client_id_fkey to bulk_import_jobs_company_id_fkey;
alter table public.service_cases
  rename constraint service_cases_client_tenant_fk to service_cases_company_tenant_fk;

alter index if exists public.clients_tenant_id_id_key
  rename to company_profiles_tenant_id_id_key;
alter index if exists public.clients_tenant_id_idx
  rename to company_profiles_tenant_id_idx;
alter index if exists public.employees_client_id_idx
  rename to employees_company_id_idx;
alter index if exists public.customer_profiles_linked_client_idx
  rename to customer_profiles_linked_company_idx;
alter index if exists public.document_requests_tenant_client_idx
  rename to document_requests_tenant_company_idx;
alter index if exists public.documents_tenant_client_idx
  rename to documents_tenant_company_idx;
alter index if exists public.bulk_import_jobs_parent_client_idx
  rename to bulk_import_jobs_company_idx;
alter index if exists public.invoices_client_status_idx
  rename to invoices_company_status_idx;
alter index if exists public.meetings_client_scheduled_idx
  rename to meetings_company_scheduled_idx;
alter index if exists public.service_cases_tenant_client_status_idx
  rename to service_cases_tenant_company_status_idx;

alter policy clients_tenant_rw on public.company_profiles rename to company_profiles_tenant_rw;
alter policy clients_super_admin_read on public.company_profiles
  rename to company_profiles_super_admin_read;
alter policy clients_admin_read on public.company_profiles rename to company_profiles_admin_read;
alter trigger clients_set_updated_at on public.company_profiles rename to company_profiles_set_updated_at;
alter trigger clients_renewals_sync on public.company_profiles rename to company_profiles_renewals_sync;

-- A view column keeps its original output name when its source column is renamed.
-- Recreate the view so the public read contract exposes company_id as well.
drop view public.service_cases_ranked;
create view public.service_cases_ranked
with (security_invoker = true)
as
select
  id,
  tenant_id,
  company_id,
  title,
  service_type,
  status,
  priority,
  assigned_to,
  due_at,
  sla_due_at,
  blocked_reason,
  completed_at,
  created_at,
  updated_at,
  case when sla_due_at < now() then 0 else 1 end as sla_breach_rank,
  case priority
    when 'urgent' then 0
    when 'high' then 1
    when 'normal' then 2
    when 'low' then 3
    else 4
  end as priority_rank
from public.service_cases;

revoke all on public.service_cases_ranked from public, anon, authenticated;
grant select on public.service_cases_ranked to service_role;

-- Signatures whose input or output names change must be dropped before recreation.
drop function if exists public.create_service_case_with_audit(
  uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, text[]
);
drop function if exists public.list_pro_document_center(
  uuid, text, text, uuid, text, date, date, date, date, text, text, uuid, integer, integer
);
drop function if exists public.set_pro_document_expiry(uuid, uuid, uuid, date);
drop function if exists public.review_document_version(
  uuid, uuid, uuid, text, text, timestamptz
);

create or replace function public.renewals_sync_from_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_action text;
  v_was_insert boolean;
begin
  if NEW.license_expiry is not null then
    insert into public.renewals (
      tenant_id, company_id, type, label, due_date, notify_at, source, status
    ) values (
      NEW.tenant_id, NEW.id, 'license',
      'Trade license — ' || coalesce(NEW.trade_license_no, NEW.company_name),
      NEW.license_expiry,
      public.compute_notify_at(NEW.license_expiry, 'license'),
      'license_backfill',
      case
        when (NEW.license_expiry - current_date) < 0 then 'overdue'
        when (NEW.license_expiry - current_date) <= 30 then 'due_soon'
        else 'upcoming'
      end
    )
    on conflict (tenant_id, company_id, type)
      where source = 'license_backfill'
    do update set
      label = excluded.label,
      due_date = excluded.due_date,
      notify_at = excluded.notify_at,
      status = case
        when public.renewals.status = 'completed' then 'completed'
        else excluded.status
      end,
      completed_at = case
        when public.renewals.status = 'completed' then public.renewals.completed_at
        else null
      end,
      updated_at = now()
    returning id, (xmax = 0) into v_row_id, v_was_insert;

    if v_was_insert then
      v_action := 'created';
    else
      v_action := 'updated';
    end if;

    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      NEW.tenant_id,
      null,
      v_action,
      'system',
      jsonb_build_object(
        'entity', 'renewal',
        'op', 'license_backfill',
        'renewal_id', v_row_id,
        'company_id', NEW.id,
        'license_expiry', NEW.license_expiry
      )
    );
  else
    update public.renewals
       set status = 'cancelled', updated_at = now()
     where tenant_id = NEW.tenant_id
       and company_id = NEW.id
       and type = 'license'
       and source = 'license_backfill'
       and status not in ('cancelled', 'completed')
     returning id into v_row_id;

    if v_row_id is not null then
      insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
      values (
        NEW.tenant_id,
        null,
        'cancelled',
        'system',
        jsonb_build_object(
          'entity', 'renewal',
          'op', 'license_backfill',
          'renewal_id', v_row_id,
          'company_id', NEW.id,
          'reason', 'license_expiry_cleared'
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.renewals_sync_from_license()
  from public, anon, authenticated;

create or replace function public.create_service_case_with_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_company_id uuid,
  p_title text,
  p_service_type text,
  p_priority text,
  p_assigned_to uuid,
  p_due_at timestamptz,
  p_sla_due_at timestamptz,
  p_blocked_reason text,
  p_changed_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_id uuid;
begin
  perform 1
  from public.tenants
  where id = p_tenant_id
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  insert into public.service_cases (
    tenant_id, company_id, title, service_type, priority, assigned_to,
    due_at, sla_due_at, blocked_reason, created_by
  ) values (
    p_tenant_id, p_company_id, p_title, p_service_type, p_priority, p_assigned_to,
    p_due_at, p_sla_due_at, p_blocked_reason, p_actor_id
  )
  returning id into v_case_id;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_actor_id,
    'service_case_created',
    'self_serve',
    jsonb_build_object(
      'entity', 'service_case',
      'id', v_case_id,
      'changed_keys', to_jsonb(p_changed_keys)
    )
  );

  return v_case_id;
end;
$$;

create or replace function public.update_service_case_with_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_case_id uuid,
  p_patch jsonb,
  p_changed_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_id uuid;
begin
  perform 1
  from public.tenants
  where id = p_tenant_id
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  update public.service_cases
  set
    status = case when p_patch ? 'status' then p_patch ->> 'status' else status end,
    priority = case when p_patch ? 'priority' then p_patch ->> 'priority' else priority end,
    assigned_to = case
      when p_patch ? 'assigned_to' then (p_patch ->> 'assigned_to')::uuid
      else assigned_to
    end,
    due_at = case
      when p_patch ? 'due_at' then (p_patch ->> 'due_at')::timestamptz
      else due_at
    end,
    sla_due_at = case
      when p_patch ? 'sla_due_at' then (p_patch ->> 'sla_due_at')::timestamptz
      else sla_due_at
    end,
    blocked_reason = case
      when p_patch ? 'blocked_reason' then p_patch ->> 'blocked_reason'
      else blocked_reason
    end,
    completed_at = case
      when p_patch ? 'completed_at' then (p_patch ->> 'completed_at')::timestamptz
      else completed_at
    end
  where id = p_case_id
    and tenant_id = p_tenant_id
  returning id into v_case_id;

  if v_case_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_actor_id,
    'service_case_updated',
    'self_serve',
    jsonb_build_object(
      'entity', 'service_case',
      'id', v_case_id,
      'changed_keys', to_jsonb(p_changed_keys)
    )
  );

  return v_case_id;
end;
$$;

revoke all on function public.create_service_case_with_audit(
  uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_service_case_with_audit(
  uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, text[]
) to service_role;

revoke all on function public.update_service_case_with_audit(
  uuid, uuid, uuid, jsonb, text[]
) from public, anon, authenticated;
grant execute on function public.update_service_case_with_audit(
  uuid, uuid, uuid, jsonb, text[]
) to service_role;

create or replace function public.admin_change_role_atomic(
  p_target_id uuid,
  p_actor_id uuid,
  p_expected_role text,
  p_expected_tenant_id uuid,
  p_new_role text,
  p_new_tenant_id uuid,
  p_role_data jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_profile public.profiles%rowtype;
  committed_profile public.profiles%rowtype;
  employee_company_id uuid;
begin
  select *
  into current_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;
  if current_profile.role::text is distinct from p_expected_role
    or current_profile.tenant_id is distinct from p_expected_tenant_id
  then
    raise exception using errcode = '40001', message = 'PROFILE_CHANGED_RETRY';
  end if;
  if p_new_role not in ('admin', 'pro', 'customer', 'employee') then
    raise exception using errcode = '23514', message = 'INVALID_ROLE_TRANSITION';
  end if;
  if (p_new_role = 'admin') <> (p_new_tenant_id is null) then
    raise exception using errcode = '23514', message = 'INVALID_TENANT_ASSIGNMENT';
  end if;

  if exists (
    select 1
    from public.pro_company_assignments as assignment
    where assignment.pro_profile_id = p_target_id
      and assignment.status = 'active'
      and (
        p_new_role is distinct from 'pro'
        or current_profile.status::text is distinct from 'active'
        or p_new_tenant_id is distinct from assignment.tenant_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'ACTIVE_PRO_COMPANY_ASSIGNMENT';
  end if;

  if p_new_tenant_id is distinct from current_profile.tenant_id
    and exists (
      select 1
      from public.service_cases as service_case
      where service_case.assigned_to = p_target_id
         or service_case.created_by = p_target_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES';
  end if;

  if p_new_role = 'employee' then
    employee_company_id := nullif(p_role_data ->> 'company_id', '')::uuid;
    if employee_company_id is null or not exists (
      select 1 from public.company_profiles
      where id = employee_company_id and tenant_id = p_new_tenant_id
    ) then
      raise exception using errcode = '23514', message = 'EMPLOYEE_COMPANY_TENANT_MISMATCH';
    end if;
  elsif p_new_role = 'customer'
    and nullif(p_role_data ->> 'linked_company_id', '') is not null
    and not exists (
      select 1 from public.company_profiles
      where id = (p_role_data ->> 'linked_company_id')::uuid
        and tenant_id = p_new_tenant_id
    )
  then
    raise exception using errcode = '23514', message = 'CUSTOMER_COMPANY_TENANT_MISMATCH';
  end if;

  delete from public.pro_profiles where profile_id = p_target_id;
  delete from public.customer_profiles where profile_id = p_target_id;
  delete from public.employees where profile_id = p_target_id;

  update public.profiles
  set role = p_new_role::public.app_role,
      tenant_id = p_new_tenant_id
  where id = p_target_id
  returning role, tenant_id, status, updated_at
  into committed_profile.role, committed_profile.tenant_id,
    committed_profile.status, committed_profile.updated_at;

  if p_new_role = 'pro' then
    insert into public.pro_profiles (
      profile_id, license_no_encrypted, designation, department, service_areas, bio
    ) values (
      p_target_id,
      p_role_data ->> 'license_no_encrypted',
      p_role_data ->> 'designation',
      p_role_data ->> 'department',
      coalesce(p_role_data -> 'service_areas', '[]'::jsonb),
      p_role_data ->> 'bio'
    );
  elsif p_new_role = 'customer' then
    insert into public.customer_profiles (
      profile_id, nationality, passport_no_encrypted, linked_company_id
    ) values (
      p_target_id,
      p_role_data ->> 'nationality',
      p_role_data ->> 'passport_no_encrypted',
      nullif(p_role_data ->> 'linked_company_id', '')::uuid
    );
  elsif p_new_role = 'employee' then
    insert into public.employees (
      tenant_id, company_id, profile_id, name, email, phone,
      passport_no_encrypted, visa_no_encrypted, visa_expiry,
      emirates_id_encrypted, eid_expiry, status
    ) values (
      p_new_tenant_id,
      employee_company_id,
      p_target_id,
      coalesce(nullif(p_role_data ->> 'name', ''), 'Unnamed'),
      nullif(p_role_data ->> 'email', ''),
      nullif(p_role_data ->> 'phone', ''),
      p_role_data ->> 'passport_no_encrypted',
      p_role_data ->> 'visa_no_encrypted',
      nullif(p_role_data ->> 'visa_expiry', '')::date,
      p_role_data ->> 'emirates_id_encrypted',
      nullif(p_role_data ->> 'eid_expiry', '')::date,
      'active'
    );
  end if;

  insert into public.admin_audit_actions (actor_id, action, target_profile_id, reason)
  values (p_actor_id, 'change_role', p_target_id, p_reason);

  return jsonb_build_object(
    'role', committed_profile.role::text,
    'tenant_id', committed_profile.tenant_id,
    'status', committed_profile.status::text,
    'updated_at', committed_profile.updated_at
  );
end;
$$;

revoke all on function public.admin_change_role_atomic(
  uuid, uuid, text, uuid, text, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.admin_change_role_atomic(
  uuid, uuid, text, uuid, text, uuid, jsonb, text
) to service_role;

create or replace function public.list_pro_document_center(
  p_tenant_id uuid,
  p_view text default 'all',
  p_search text default null,
  p_company_id uuid default null,
  p_doc_type text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_expiry_from date default null,
  p_expiry_to date default null,
  p_sort text default 'urgency',
  p_focus_kind text default null,
  p_focus_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 50
) returns table (
  entity_kind text,
  entity_id uuid,
  tenant_id uuid,
  company_id uuid,
  company_name text,
  company_status text,
  employee_id uuid,
  employee_name text,
  doc_type text,
  label text,
  request_id uuid,
  request_status text,
  due_at timestamptz,
  requested_by uuid,
  requested_by_name text,
  document_id uuid,
  current_version_id uuid,
  current_version_created_at timestamptz,
  current_version_mime_type text,
  current_version_size_bytes bigint,
  review_status text,
  review_note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  effective_expires_on date,
  expiry_source text,
  created_at timestamptz,
  total_count bigint,
  effective_page integer
)
language sql
stable
security invoker
as $function$
with params as materialized (
  select
    coalesce(p_view, 'all') as view_name,
    nullif(lower(trim(p_search)), '') as search_term,
    p_company_id as company_filter,
    p_doc_type as doc_type_filter,
    p_due_from as due_from,
    p_due_to as due_to,
    p_expiry_from as expiry_from,
    p_expiry_to as expiry_to,
    coalesce(p_sort, 'urgency') as sort_name,
    p_focus_kind as focus_kind,
    p_focus_id as focus_id,
    (now() at time zone 'Asia/Dubai')::date as dubai_today
  where coalesce(p_view, 'all') in (
      'all', 'requested', 'submitted', 'approved', 'rejected', 'expiring', 'overdue'
    )
    and (
      p_doc_type is null
      or p_doc_type in (
        'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
        'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
        'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
      )
    )
    and coalesce(p_sort, 'urgency') in (
      'urgency', 'newest', 'oldest', 'due_date', 'expiry_date'
    )
    and (p_due_from is null or p_due_to is null or p_due_from <= p_due_to)
    and (p_expiry_from is null or p_expiry_to is null or p_expiry_from <= p_expiry_to)
    and (
      (p_focus_kind is null and p_focus_id is null)
      or (p_focus_kind in ('request', 'document') and p_focus_id is not null)
    )
    and p_page is not null
    and p_page_size is not null
), request_rows as (
  select
    'request'::text as entity_kind,
    r.id as entity_id,
    c.tenant_id,
    c.id as company_id,
    c.company_name as company_name,
    c.status::text as company_status,
    r.employee_id,
    e.name as employee_name,
    r.doc_type,
    r.label,
    r.id as request_id,
    r.status as request_status,
    r.due_at,
    r.requested_by,
    requester.full_name as requested_by_name,
    null::uuid as document_id,
    null::uuid as current_version_id,
    null::timestamptz as current_version_created_at,
    null::text as current_version_mime_type,
    null::bigint as current_version_size_bytes,
    null::text as review_status,
    null::text as review_note,
    null::uuid as reviewed_by,
    null::text as reviewed_by_name,
    null::timestamptz as reviewed_at,
    case
      when r.doc_type = 'trade_license' then c.license_expiry
      when r.doc_type = 'visa' and r.employee_id is not null then e.visa_expiry
      when r.doc_type = 'emirates_id' and r.employee_id is not null then e.eid_expiry
      else null::date
    end as effective_expires_on,
    case
      when r.doc_type = 'trade_license' then 'company_license'
      when r.doc_type = 'visa' and r.employee_id is not null then 'employee_visa'
      when r.doc_type = 'emirates_id' and r.employee_id is not null then 'employee_emirates_id'
      else null::text
    end as expiry_source,
    r.created_at
  from public.company_profiles c
  join public.document_requests r on r.company_id = c.id and r.tenant_id = c.tenant_id
  left join public.employees e on e.id = r.employee_id
    and e.tenant_id = c.tenant_id and e.company_id = c.id
  left join public.profiles requester on requester.id = r.requested_by
    and requester.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant_id
    and r.status = 'pending'
    and not exists (
      select 1
      from public.documents existing
      where existing.request_id = r.id
        and existing.tenant_id = c.tenant_id
        and existing.company_id = c.id
    )
), document_rows as (
  select
    'document'::text as entity_kind,
    d.id as entity_id,
    c.tenant_id,
    c.id as company_id,
    c.company_name as company_name,
    c.status::text as company_status,
    d.employee_id,
    e.name as employee_name,
    d.doc_type,
    coalesce(d.label, request.label, d.doc_type) as label,
    request.id as request_id,
    request.status as request_status,
    request.due_at,
    request.requested_by,
    requester.full_name as requested_by_name,
    d.id as document_id,
    version.id as current_version_id,
    version.created_at as current_version_created_at,
    version.mime_type as current_version_mime_type,
    version.size_bytes as current_version_size_bytes,
    version.review_status,
    version.review_note,
    version.reviewed_by,
    reviewer.full_name as reviewed_by_name,
    version.reviewed_at,
    case
      when d.doc_type = 'trade_license' then c.license_expiry
      when d.doc_type = 'visa' and d.employee_id is not null then e.visa_expiry
      when d.doc_type = 'emirates_id' and d.employee_id is not null then e.eid_expiry
      else d.expires_on
    end as effective_expires_on,
    case
      when d.doc_type = 'trade_license' then 'company_license'
      when d.doc_type = 'visa' and d.employee_id is not null then 'employee_visa'
      when d.doc_type = 'emirates_id' and d.employee_id is not null then 'employee_emirates_id'
      else 'document'
    end as expiry_source,
    d.created_at
  from public.company_profiles c
  join public.documents d on d.company_id = c.id and d.tenant_id = c.tenant_id
  left join public.employees e on e.id = d.employee_id
    and e.tenant_id = c.tenant_id and e.company_id = c.id
  left join public.document_requests request on request.id = d.request_id
    and request.tenant_id = c.tenant_id and request.company_id = c.id
  left join public.profiles requester on requester.id = request.requested_by
    and requester.tenant_id = c.tenant_id
  left join public.document_versions version on version.id = d.current_version_id
    and version.document_id = d.id and version.tenant_id = c.tenant_id
  left join public.profiles reviewer on reviewer.id = version.reviewed_by
    and reviewer.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant_id
), unified as (
  select * from request_rows
  union all
  select * from document_rows
), filtered as materialized (
  select unified.*
  from unified
  cross join params
  where (params.company_filter is null or unified.company_id = params.company_filter)
    and (params.doc_type_filter is null or unified.doc_type = params.doc_type_filter)
    and (
      params.search_term is null
      or position(params.search_term in lower(concat_ws(
        ' ', unified.company_name, unified.employee_name, unified.label, unified.doc_type,
        unified.requested_by_name, unified.reviewed_by_name
      ))) > 0
    )
    and (
      params.due_from is null
      or (unified.due_at at time zone 'Asia/Dubai')::date >= params.due_from
    )
    and (
      params.due_to is null
      or (unified.due_at at time zone 'Asia/Dubai')::date <= params.due_to
    )
    and (
      params.expiry_from is null
      or unified.effective_expires_on >= params.expiry_from
    )
    and (
      params.expiry_to is null
      or unified.effective_expires_on <= params.expiry_to
    )
    and (
      params.focus_kind is null
      or (unified.entity_kind = params.focus_kind and unified.entity_id = params.focus_id)
    )
    and case params.view_name
      when 'all' then true
      when 'requested' then unified.entity_kind = 'request'
      when 'submitted' then unified.entity_kind = 'document' and unified.review_status = 'pending'
      when 'approved' then unified.review_status = 'approved'
      when 'rejected' then unified.review_status = 'rejected'
      when 'expiring' then unified.effective_expires_on between params.dubai_today and params.dubai_today + 30
      when 'overdue' then unified.entity_kind = 'request'
        and (unified.due_at at time zone 'Asia/Dubai')::date < params.dubai_today
      else false
    end
), counted as materialized (
  select filtered.*, count(*) over() as total_count
  from filtered
), page_bounds as materialized (
  select coalesce(
    least(
      greatest(p_page, 1),
      ceil(
        max(counted.total_count)::numeric
        / least(greatest(p_page_size, 1), 50)
      )::integer
    ),
    1
  ) as effective_page
  from counted
)
select
  counted.entity_kind,
  counted.entity_id,
  counted.tenant_id,
  counted.company_id,
  counted.company_name,
  counted.company_status,
  counted.employee_id,
  counted.employee_name,
  counted.doc_type,
  counted.label,
  counted.request_id,
  counted.request_status,
  counted.due_at,
  counted.requested_by,
  counted.requested_by_name,
  counted.document_id,
  counted.current_version_id,
  counted.current_version_created_at,
  counted.current_version_mime_type,
  counted.current_version_size_bytes,
  counted.review_status,
  counted.review_note,
  counted.reviewed_by,
  counted.reviewed_by_name,
  counted.reviewed_at,
  counted.effective_expires_on,
  counted.expiry_source,
  counted.created_at,
  counted.total_count,
  (select effective_page from page_bounds) as effective_page
from counted
cross join params
order by
  case when params.sort_name = 'urgency' then case
    when counted.entity_kind = 'request'
      and counted.request_status = 'pending'
      and (counted.due_at at time zone 'Asia/Dubai')::date < params.dubai_today then 0
    when counted.entity_kind = 'document'
      and counted.review_status = 'rejected' then 1
    when counted.entity_kind = 'document'
      and counted.review_status = 'pending' then 2
    when counted.entity_kind = 'request'
      and counted.request_status = 'pending' then 3
    when counted.entity_kind = 'document'
      and counted.effective_expires_on is not null then 4
    else 5
  end end asc,
  case when params.sort_name = 'urgency' and counted.entity_kind = 'request'
    then counted.due_at end asc nulls last,
  case when params.sort_name = 'urgency' and counted.entity_kind = 'document'
      and counted.review_status in ('rejected', 'pending')
    then counted.current_version_created_at end asc nulls last,
  case when params.sort_name = 'urgency' and counted.entity_kind = 'document'
      and counted.effective_expires_on is not null
    then counted.effective_expires_on end asc nulls last,
  case when params.sort_name = 'newest' then counted.created_at end desc,
  case when params.sort_name = 'oldest' then counted.created_at end asc,
  case when params.sort_name = 'due_date' then counted.due_at end asc nulls last,
  case when params.sort_name = 'expiry_date' then counted.effective_expires_on end asc nulls last,
  counted.entity_kind asc, counted.entity_id asc
limit least(greatest(p_page_size, 1), 50)
offset (((select effective_page from page_bounds) - 1)
  * least(greatest(p_page_size, 1), 50));
$function$;

revoke all on function public.list_pro_document_center(
  uuid, text, text, uuid, text, date, date, date, date, text, text, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_pro_document_center(
  uuid, text, text, uuid, text, date, date, date, date, text, text, uuid, integer, integer
) to service_role;

create or replace function public.get_pro_document_version_history(
  p_tenant_id uuid,
  p_document_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with owned as materialized (
  select
    d.id as document_id,
    d.tenant_id,
    d.current_version_id
  from public.documents d
  join public.company_profiles c
    on c.id = d.company_id
    and c.tenant_id = d.tenant_id
  where d.id = p_document_id
    and d.tenant_id = p_tenant_id
    and c.tenant_id = p_tenant_id
), ranked as materialized (
  select
    v.id as version_id,
    owned.current_version_id,
    v.created_at,
    v.uploaded_by,
    uploader.full_name as uploader_name,
    v.review_status,
    v.reviewed_by,
    reviewer.full_name as reviewer_name,
    v.reviewed_at,
    v.review_note,
    v.size_bytes,
    v.mime_type,
    count(*) over() as total,
    row_number() over (order by v.created_at desc, v.id desc) as newest_rank
  from owned
  join public.document_versions v
    on v.document_id = owned.document_id
    and v.tenant_id = owned.tenant_id
  left join public.profiles uploader
    on uploader.id = v.uploaded_by
    and uploader.tenant_id = owned.tenant_id
  left join public.profiles reviewer
    on reviewer.id = v.reviewed_by
    and reviewer.tenant_id = owned.tenant_id
), versions as (
  select
    max(ranked.total) as total,
    jsonb_agg(
      jsonb_build_object(
        'versionId', ranked.version_id,
        'versionNumber', ranked.total - ranked.newest_rank + 1,
        'current', coalesce(ranked.version_id = ranked.current_version_id, false),
        'uploadedAt', ranked.created_at,
        'uploadedBy', ranked.uploaded_by,
        'uploaderName', ranked.uploader_name,
        'reviewStatus', ranked.review_status,
        'reviewedBy', ranked.reviewed_by,
        'reviewerName', ranked.reviewer_name,
        'reviewedAt', ranked.reviewed_at,
        'reviewNote', ranked.review_note,
        'sizeBytes', ranked.size_bytes,
        'mimeType', ranked.mime_type
      )
      order by ranked.created_at desc, ranked.version_id desc
    ) as items
  from ranked
)
select jsonb_build_object(
  'documentId', owned.document_id,
  'currentVersionId', owned.current_version_id,
  'total', coalesce(versions.total, 0),
  'versions', coalesce(versions.items, '[]'::jsonb)
)
from owned
cross join versions;
$function$;

revoke all on function public.get_pro_document_version_history(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.get_pro_document_version_history(
  uuid, uuid
) to service_role;
create or replace function public.set_pro_document_expiry(
  p_tenant_id uuid,
  p_document_id uuid,
  p_actor_id uuid,
  p_expires_on date
) returns table (
  document_id uuid,
  company_id uuid,
  expires_on date
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_document_id uuid;
  v_document_tenant_id uuid;
  v_document_company_id uuid;
  v_document_doc_type text;
  v_document_employee_id uuid;
  v_company_id uuid;
  v_company_tenant_id uuid;
  v_employee_id uuid;
  v_employee_tenant_id uuid;
  v_employee_company_id uuid;
  v_updated_id uuid;
  v_updated_expires_on date;
begin
  perform 1
  from public.tenants
  where id = p_tenant_id
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select
    d.id,
    d.tenant_id,
    d.company_id,
    d.doc_type,
    d.employee_id,
    c.id,
    c.tenant_id
  into
    v_document_id,
    v_document_tenant_id,
    v_document_company_id,
    v_document_doc_type,
    v_document_employee_id,
    v_company_id,
    v_company_tenant_id
  from public.documents d
  join public.company_profiles c on c.id = d.company_id
  where d.id = p_document_id
  for update of d, c;

  if not found then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  if v_document_tenant_id <> p_tenant_id
    or v_company_tenant_id <> p_tenant_id
    or v_document_company_id <> v_company_id then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  if v_document_employee_id is not null then
    select e.id, e.tenant_id, e.company_id
    into v_employee_id, v_employee_tenant_id, v_employee_company_id
    from public.employees e
    where e.id = v_document_employee_id
    for share of e;

    if not found
      or v_employee_tenant_id <> p_tenant_id
      or v_employee_company_id <> v_document_company_id then
      raise exception using errcode = 'MD404', message = 'document_not_found';
    end if;
  end if;

  if v_document_doc_type = 'trade_license'
    or (
      v_document_employee_id is not null
      and v_document_doc_type in ('visa', 'emirates_id')
    ) then
    raise exception using errcode = 'MD409', message = 'expiry_externally_managed';
  end if;

  update public.documents d
  set expires_on = p_expires_on
  where d.id = v_document_id
    and d.tenant_id = p_tenant_id
  returning d.id, d.expires_on into v_updated_id, v_updated_expires_on;

  if not found then
    raise exception using errcode = 'P0001', message = 'document_update_failed';
  end if;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    p_tenant_id,
    p_actor_id,
    'updated',
    'self_serve',
    jsonb_build_object(
      'entity', 'document',
      'op', 'set_expiry',
      'document_id', v_updated_id,
      'expires_on', v_updated_expires_on
    )
  );

  return query select v_updated_id, v_document_company_id, v_updated_expires_on;
end;
$function$;

revoke all on function public.set_pro_document_expiry(
  uuid, uuid, uuid, date
) from public, anon, authenticated;
grant execute on function public.set_pro_document_expiry(
  uuid, uuid, uuid, date
) to service_role;

-- Atomic, ownership-safe PRO document review.
-- The service-role DAL calls this RPC because service-role access bypasses RLS;
-- every tenant discriminator and relationship edge is therefore revalidated
-- while the affected rows are locked in one database transaction.

create or replace function public.review_document_version(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_version_id uuid,
  p_status text,
  p_note text,
  p_reviewed_at timestamptz
) returns table (
  document_id uuid,
  company_id uuid,
  fulfilled_request_id uuid,
  review_status text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_trimmed_note text;
  v_version_id uuid;
  v_version_tenant_id uuid;
  v_version_document_id uuid;
  v_version_review_status text;
  v_document_id uuid;
  v_document_tenant_id uuid;
  v_document_company_id uuid;
  v_request_id uuid;
  v_document_current_version_id uuid;
  v_company_id uuid;
  v_company_tenant_id uuid;
  v_request_tenant_id uuid;
  v_request_company_id uuid;
  v_request_status text;
  v_updated_version_id uuid;
  v_updated_document_id uuid;
  v_fulfilled_request_id uuid;
begin
  perform 1
  from public.tenants
  where id = p_tenant_id
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select
    v.id,
    v.tenant_id,
    v.document_id,
    v.review_status,
    d.id,
    d.tenant_id,
    d.company_id,
    d.request_id,
    d.current_version_id,
    c.id,
    c.tenant_id
  into
    v_version_id,
    v_version_tenant_id,
    v_version_document_id,
    v_version_review_status,
    v_document_id,
    v_document_tenant_id,
    v_document_company_id,
    v_request_id,
    v_document_current_version_id,
    v_company_id,
    v_company_tenant_id
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  join public.company_profiles c on c.id = d.company_id
  where v.id = p_version_id
  for update of v, d, c;

  if not found then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  if v_version_tenant_id <> p_tenant_id
    or v_document_tenant_id <> p_tenant_id
    or v_company_tenant_id <> p_tenant_id
    or v_version_document_id <> v_document_id
    or v_document_company_id <> v_company_id then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  if v_version_review_status <> 'pending'
    or v_document_current_version_id is distinct from p_version_id then
    raise exception using errcode = 'MD409', message = 'document_review_conflict';
  end if;

  if v_request_id is not null then
    select r.tenant_id, r.company_id, r.status
    into v_request_tenant_id, v_request_company_id, v_request_status
    from public.document_requests r
    where r.id = v_request_id
    for update of r;

    if not found
      or v_request_tenant_id <> p_tenant_id
      or v_request_company_id <> v_document_company_id then
      raise exception using errcode = 'MD404', message = 'document_version_not_found';
    end if;
  end if;

  if p_status is null
    or p_status not in ('approved', 'rejected') then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;
  v_trimmed_note := case
    when p_note is null then null
    else btrim(p_note, v_trim_characters)
  end;
  if p_status = 'rejected'
    and coalesce(v_trimmed_note, '') = '' then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;
  if char_length(coalesce(v_trimmed_note, '')) > 280 then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;

  update public.document_versions v
  set
    review_status = p_status,
    review_note = v_trimmed_note,
    reviewed_by = p_actor_id,
    reviewed_at = p_reviewed_at
  where v.id = p_version_id
    and v.tenant_id = p_tenant_id
    and v.document_id = v_document_id
    and v.review_status = 'pending'
  returning v.id into v_updated_version_id;

  if v_updated_version_id is null then
    raise exception using errcode = 'P0001', message = 'document_review_update_failed';
  end if;

  if p_status = 'approved' then
    update public.documents d
    set
      current_version_id = p_version_id,
      updated_at = p_reviewed_at
    where d.id = v_document_id
      and d.tenant_id = p_tenant_id
      and d.company_id = v_document_company_id
      and d.current_version_id = p_version_id
    returning d.id into v_updated_document_id;

    if v_updated_document_id is null then
      raise exception using errcode = 'P0001', message = 'document_head_update_failed';
    end if;

    if v_request_id is not null and v_request_status = 'pending' then
      update public.document_requests r
      set
        status = 'fulfilled',
        updated_at = p_reviewed_at
      where r.id = v_request_id
        and r.tenant_id = p_tenant_id
        and r.company_id = v_document_company_id
        and r.status = 'pending'
      returning r.id into v_fulfilled_request_id;

      if v_fulfilled_request_id is null then
        raise exception using errcode = 'P0001', message = 'document_request_update_failed';
      end if;
    elsif v_request_id is not null and v_request_status = 'fulfilled' then
      v_fulfilled_request_id := v_request_id;
    elsif v_request_status = 'cancelled' then
      v_fulfilled_request_id := null;
    end if;
  end if;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    p_tenant_id,
    p_actor_id,
    'updated',
    'self_serve',
    jsonb_build_object(
      'entity', 'document',
      'op', 'review',
      'version_id', p_version_id,
      'document_id', v_document_id,
      'review_status', p_status,
      'fulfilled_request_id', v_fulfilled_request_id
    )
  );

  return query select
    v_document_id,
    v_document_company_id,
    v_fulfilled_request_id,
    p_status;
end;
$function$;

revoke all on function public.review_document_version(
  uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.review_document_version(
  uuid, uuid, uuid, text, text, timestamptz
) to service_role;

commit;
