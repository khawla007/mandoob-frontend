-- P3.06 Registration & Visa Workflow.
--
-- Reconstructs the Step 4 company-registration + visa schema and command/read
-- boundary as a single additive forward migration. Normalizes registration
-- state, exact document evidence, and an immutable event history; exposes
-- replay-safe SECURITY DEFINER command RPCs and role-scoped read RPCs; and
-- registers the P3.06 domain-event contracts over the frozen event-queue
-- interface (0093) using the 0105 domain-integration template.
--
-- Hardening applied on top of the Step 4 dumps:
--   * read_operator_registration_workflow now requires operator AAL2 and writes
--     a cross-tenant operator-read audit row inside the function.
--   * transition_registration_stage distinguishes status-only changes
--     (block/unblock: from==to==current_stage) from stage advances in the
--     emitted stage/domain event.
--   * RLS is enabled AND real read policies are added (PRO / customer /
--     employee); scope resolves from live DB state, never from JWT claims.
--   * admin recovery-unlink uses a distinct operation_kind so a prior PRO
--     unlink receipt cannot replay-shadow the admin recovery.
--   * every function is SECURITY DEFINER, set search_path = '', pg_catalog/
--     public-qualified, owned by postgres, and granted only to service_role.
--   * event payloads are reference-only (ids/codes/state), privacy 'restricted'.
begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Presentation-facing enums below match the binding frontend contract exactly:
--   stage codes (ordered 1..7), stage statuses, visa milestone codes (1..6),
--   visa statuses. Internal enums (person kind, visa kind, document role,
--   operation kind) stay Step 4 shaped but only contract values surface to reads.
create type public.registration_stage_code as enum (
  'application_submitted',
  'initial_approval',
  'name_reservation',
  'license_issuance',
  'visa_processing',
  'bank_account',
  'completed'
);
create type public.registration_stage_status as enum (
  'not_started', 'in_progress', 'blocked', 'completed', 'skipped'
);
create type public.registration_status as enum (
  'draft', 'in_progress', 'blocked', 'completed', 'cancelled'
);
create type public.registration_person_kind as enum (
  'shareholder', 'employee', 'dependent', 'other'
);
create type public.registration_visa_kind as enum ('investor', 'employee', 'family');
-- Contract visa statuses are not_started/active/blocked/completed/unavailable/
-- cancelled. Internally we retain in_progress as the working state; reads map it
-- onto the contract 'active' value (see read RPCs), and 'skipped' at stage level
-- surfaces as 'unavailable'. No presentation surface exposes the raw internal
-- token.
create type public.registration_visa_status as enum (
  'not_started', 'in_progress', 'blocked', 'completed', 'cancelled'
);
create type public.registration_visa_stage_code as enum (
  'documents_ready',
  'entry_permit',
  'status_adjustment',
  'medical_fitness',
  'emirates_id',
  'residency_issued'
);
create type public.registration_document_role as enum (
  'application_form',
  'approval_letter',
  'trade_name_approval',
  'trade_license',
  'visa_evidence',
  'bank_evidence',
  'other'
);
create type public.registration_domain_event_code as enum ('registration_stage_changed');
-- recover_unlink_document is a distinct kind from unlink_document so an admin
-- recovery cannot replay-shadow (or be shadowed by) a prior PRO unlink receipt
-- that happened to reuse the same operation_id within the same scope.
create type public.registration_operation_kind as enum (
  'create_registration',
  'transition_stage',
  'link_document',
  'unlink_document',
  'recover_unlink_document',
  'create_visa_person',
  'transition_visa_person',
  'cancel_visa_person'
);

-- ---------------------------------------------------------------------------
-- Parent identity keys required for the composite ownership chains below.
-- documents(tenant_id, company_id, id), document_versions(tenant_id,
-- document_id, id), and employees(tenant_id, company_id, id) already exist in
-- base (0060); service_cases and company_shareholders composite identities do
-- not, so add them here idempotently.
-- ---------------------------------------------------------------------------
create unique index if not exists service_cases_tenant_company_id_key
  on public.service_cases (tenant_id, company_id, id);
create unique index if not exists company_shareholders_tenant_company_id_key
  on public.company_shareholders (tenant_id, company_id, id);

-- ---------------------------------------------------------------------------
-- Helper: exact top-level jsonb key count (Postgres has no jsonb_object_length).
-- Immutable + fixed search_path so it is safe inside CHECK constraints and
-- SECURITY DEFINER bodies. Reference-only-payload key-count enforcement depends
-- on it.
-- ---------------------------------------------------------------------------
create function private.jsonb_key_count(p_value jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.count(*)::integer from pg_catalog.jsonb_object_keys(p_value)
$$;
alter function private.jsonb_key_count(jsonb) owner to postgres;
revoke all on function private.jsonb_key_count(jsonb) from public, anon, authenticated;
grant execute on function private.jsonb_key_count(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.company_registrations (
  id uuid primary key default gen_random_uuid(),
  service_case_id uuid not null unique,
  tenant_id uuid not null,
  company_id uuid not null,
  status public.registration_status not null default 'draft',
  current_stage public.registration_stage_code not null default 'application_submitted',
  version bigint not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_registrations_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint company_registrations_service_case_fk
    foreign key (tenant_id, company_id, service_case_id)
    references public.service_cases (tenant_id, company_id, id)
    on delete cascade,
  constraint company_registrations_ownership_identity
    unique (tenant_id, company_id, id),
  constraint company_registrations_version_nonnegative check (version >= 0),
  constraint company_registrations_timestamps check (
    completed_at is null or (started_at is not null and completed_at >= started_at)
  ),
  constraint company_registrations_status_timestamp_shape check (
    (status = 'draft' and started_at is null and completed_at is null)
    or (status in ('in_progress', 'blocked') and started_at is not null and completed_at is null)
    or (
      status = 'completed'
      and started_at is not null
      and completed_at is not null
      and current_stage = 'completed'
    )
    or (status = 'cancelled' and completed_at is null)
  )
);

create unique index company_registrations_one_active_company
  on public.company_registrations (tenant_id, company_id)
  where status in ('draft', 'in_progress', 'blocked');
create index company_registrations_company_history_idx
  on public.company_registrations (tenant_id, company_id, created_at desc, id desc);

create table public.registration_stages (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  code public.registration_stage_code not null,
  ordinal smallint not null check (ordinal between 1 and 7),
  status public.registration_stage_status not null default 'not_started',
  details jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_stages_registration_fk
    foreign key (tenant_id, company_id, registration_id)
    references public.company_registrations (tenant_id, company_id, id)
    on delete cascade,
  constraint registration_stages_registration_code unique (registration_id, code),
  constraint registration_stages_registration_ordinal unique (registration_id, ordinal),
  constraint registration_stages_ownership_identity
    unique (tenant_id, company_id, registration_id, id),
  constraint registration_stages_code_ordinal check (
    (code = 'application_submitted' and ordinal = 1)
    or (code = 'initial_approval' and ordinal = 2)
    or (code = 'name_reservation' and ordinal = 3)
    or (code = 'license_issuance' and ordinal = 4)
    or (code = 'visa_processing' and ordinal = 5)
    or (code = 'bank_account' and ordinal = 6)
    or (code = 'completed' and ordinal = 7)
  ),
  constraint registration_stages_details_object
    check (pg_catalog.jsonb_typeof(details) = 'object'),
  constraint registration_stages_version_nonnegative check (version >= 0),
  constraint registration_stages_timestamp_order check (
    completed_at is null or (started_at is not null and completed_at >= started_at)
  ),
  constraint registration_stages_status_timestamp_shape check (
    (status = 'not_started' and started_at is null and completed_at is null)
    or (status in ('in_progress', 'blocked') and started_at is not null and completed_at is null)
    or (status in ('completed', 'skipped') and started_at is not null and completed_at is not null)
  )
);

create index registration_stages_workflow_order_idx
  on public.registration_stages (tenant_id, company_id, registration_id, ordinal);

create table public.registration_stage_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  stage_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  document_id uuid not null,
  document_version_id uuid not null,
  role public.registration_document_role not null,
  linked_by uuid not null references public.profiles (id) on delete restrict,
  linked_at timestamptz not null default now(),
  constraint registration_stage_documents_stage_fk
    foreign key (tenant_id, company_id, registration_id, stage_id)
    references public.registration_stages (tenant_id, company_id, registration_id, id)
    on delete cascade,
  -- Evidence stored strictly as document_id + document_version_id references;
  -- no URLs or storage paths are ever persisted here (both on delete restrict).
  constraint registration_stage_documents_document_fk
    foreign key (tenant_id, company_id, document_id)
    references public.documents (tenant_id, company_id, id)
    on delete restrict,
  constraint registration_stage_documents_version_fk
    foreign key (tenant_id, document_id, document_version_id)
    references public.document_versions (tenant_id, document_id, id)
    on delete restrict,
  constraint registration_stage_documents_exact_link
    unique (stage_id, document_version_id, role)
);

create index registration_stage_documents_workflow_idx
  on public.registration_stage_documents
  (tenant_id, company_id, registration_id, stage_id, linked_at, id);

create table public.registration_visa_people (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  shareholder_id uuid,
  employee_id uuid,
  display_name text not null,
  person_kind public.registration_person_kind not null,
  visa_kind public.registration_visa_kind not null,
  current_stage public.registration_visa_stage_code not null default 'documents_ready',
  status public.registration_visa_status not null default 'not_started',
  version bigint not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_visa_people_registration_fk
    foreign key (tenant_id, company_id, registration_id)
    references public.company_registrations (tenant_id, company_id, id)
    on delete cascade,
  constraint registration_visa_people_shareholder_fk
    foreign key (tenant_id, company_id, shareholder_id)
    references public.company_shareholders (tenant_id, company_id, id)
    on delete restrict,
  constraint registration_visa_people_employee_fk
    foreign key (tenant_id, company_id, employee_id)
    references public.employees (tenant_id, company_id, id)
    on delete restrict,
  constraint registration_visa_people_ownership_identity
    unique (tenant_id, company_id, registration_id, id),
  constraint registration_visa_people_display_name_normalized check (
    display_name = pg_catalog.btrim(display_name)
    and display_name !~ '[[:space:]]{2,}'
    and pg_catalog.char_length(display_name) between 2 and 200
  ),
  constraint registration_visa_people_source_shape check (
    (person_kind = 'shareholder' and shareholder_id is not null and employee_id is null)
    or (person_kind = 'employee' and employee_id is not null and shareholder_id is null)
    or (person_kind in ('dependent', 'other') and shareholder_id is null and employee_id is null)
  ),
  constraint registration_visa_people_version_nonnegative check (version >= 0),
  constraint registration_visa_people_timestamp_order check (
    completed_at is null or (started_at is not null and completed_at >= started_at)
  ),
  constraint registration_visa_people_status_timestamp_shape check (
    (status = 'not_started' and started_at is null and completed_at is null)
    or (status in ('in_progress', 'blocked') and started_at is not null and completed_at is null)
    or (
      status = 'completed'
      and started_at is not null
      and completed_at is not null
      and current_stage = 'residency_issued'
    )
    or (status = 'cancelled' and started_at is not null and completed_at is not null)
  )
);

create unique index registration_visa_people_shareholder_uniq
  on public.registration_visa_people (registration_id, shareholder_id)
  where shareholder_id is not null;
create unique index registration_visa_people_employee_uniq
  on public.registration_visa_people (registration_id, employee_id)
  where employee_id is not null;
create index registration_visa_people_workflow_idx
  on public.registration_visa_people
  (tenant_id, company_id, registration_id, status, created_at, id);

create table public.registration_stage_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  stage_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  from_stage_status public.registration_stage_status,
  to_stage_status public.registration_stage_status not null,
  from_registration_stage public.registration_stage_code,
  to_registration_stage public.registration_stage_code not null,
  -- transition_code distinguishes a status-only change (block/unblock, where
  -- from_registration_stage == to_registration_stage == the current stage) from
  -- a stage advance ('advanced'). Consumers key off this instead of inferring
  -- intent from the from/to stage pair.
  transition_code text not null default 'advanced',
  reason_code text,
  reason_text text,
  operation_id uuid not null,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  registration_version bigint not null,
  stage_version bigint not null,
  occurred_at timestamptz not null default now(),
  constraint registration_stage_events_stage_fk
    foreign key (tenant_id, company_id, registration_id, stage_id)
    references public.registration_stages (tenant_id, company_id, registration_id, id)
    on delete restrict,
  constraint registration_stage_events_operation unique (registration_id, operation_id),
  constraint registration_stage_events_transition_code check (
    transition_code in ('started', 'advanced', 'blocked', 'unblocked', 'skipped', 'completed')
  ),
  constraint registration_stage_events_versions_positive
    check (registration_version > 0 and stage_version > 0),
  constraint registration_stage_events_reason_code check (
    reason_code is null
    or (reason_code = pg_catalog.upper(pg_catalog.btrim(reason_code))
      and reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$')
  ),
  constraint registration_stage_events_reason_text check (
    reason_text is null
    or (reason_text = pg_catalog.btrim(reason_text)
      and pg_catalog.char_length(reason_text) between 3 and 500)
  )
);

create index registration_stage_events_timeline_idx
  on public.registration_stage_events
  (tenant_id, company_id, registration_id, occurred_at desc, id desc);

create table public.registration_visa_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  visa_person_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  from_stage public.registration_visa_stage_code,
  to_stage public.registration_visa_stage_code not null,
  from_status public.registration_visa_status,
  to_status public.registration_visa_status not null,
  reason_code text,
  reason_text text,
  operation_id uuid not null,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  visa_version bigint not null,
  occurred_at timestamptz not null default now(),
  constraint registration_visa_events_person_fk
    foreign key (tenant_id, company_id, registration_id, visa_person_id)
    references public.registration_visa_people (tenant_id, company_id, registration_id, id)
    on delete restrict,
  constraint registration_visa_events_operation unique (visa_person_id, operation_id),
  constraint registration_visa_events_version_positive check (visa_version > 0),
  constraint registration_visa_events_reason_code check (
    reason_code is null
    or (reason_code = pg_catalog.upper(pg_catalog.btrim(reason_code))
      and reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$')
  ),
  constraint registration_visa_events_reason_text check (
    reason_text is null
    or (reason_text = pg_catalog.btrim(reason_text)
      and pg_catalog.char_length(reason_text) between 3 and 500)
  )
);

create index registration_visa_events_timeline_idx
  on public.registration_visa_events
  (tenant_id, company_id, registration_id, visa_person_id, occurred_at desc, id desc);

create table public.registration_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_code public.registration_domain_event_code not null,
  registration_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint registration_domain_events_registration_fk
    foreign key (tenant_id, company_id, registration_id)
    references public.company_registrations (tenant_id, company_id, id)
    on delete restrict,
  constraint registration_domain_events_payload_object
    check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint registration_domain_events_stage_changed_payload check (
    private.jsonb_key_count(payload) = 7
    and payload ?& array[
      'registrationStatus',
      'stageCode',
      'fromStageStatus',
      'toStageStatus',
      'fromRegistrationStage',
      'toRegistrationStage',
      'transitionCode'
    ]
    and pg_catalog.jsonb_typeof(payload -> 'registrationStatus') = 'string'
    and payload ->> 'registrationStatus' in ('draft', 'in_progress', 'blocked', 'completed', 'cancelled')
    and pg_catalog.jsonb_typeof(payload -> 'stageCode') = 'string'
    and payload ->> 'stageCode' in (
      'application_submitted', 'initial_approval', 'name_reservation',
      'license_issuance', 'visa_processing', 'bank_account', 'completed'
    )
    and pg_catalog.jsonb_typeof(payload -> 'fromStageStatus') in ('string', 'null')
    and (
      payload -> 'fromStageStatus' = 'null'::jsonb
      or payload ->> 'fromStageStatus' in ('not_started', 'in_progress', 'blocked', 'completed', 'skipped')
    )
    and pg_catalog.jsonb_typeof(payload -> 'toStageStatus') = 'string'
    and payload ->> 'toStageStatus' in ('not_started', 'in_progress', 'blocked', 'completed', 'skipped')
    and pg_catalog.jsonb_typeof(payload -> 'fromRegistrationStage') in ('string', 'null')
    and (
      payload -> 'fromRegistrationStage' = 'null'::jsonb
      or payload ->> 'fromRegistrationStage' in (
        'application_submitted', 'initial_approval', 'name_reservation',
        'license_issuance', 'visa_processing', 'bank_account', 'completed'
      )
    )
    and pg_catalog.jsonb_typeof(payload -> 'toRegistrationStage') = 'string'
    and payload ->> 'toRegistrationStage' in (
      'application_submitted', 'initial_approval', 'name_reservation',
      'license_issuance', 'visa_processing', 'bank_account', 'completed'
    )
    and pg_catalog.jsonb_typeof(payload -> 'transitionCode') = 'string'
    and payload ->> 'transitionCode' in (
      'started', 'advanced', 'blocked', 'unblocked', 'skipped', 'completed'
    )
  ),
  constraint registration_domain_events_consumed_order
    check (consumed_at is null or consumed_at >= occurred_at)
);

create index registration_domain_events_delivery_idx
  on public.registration_domain_events (occurred_at, id)
  where consumed_at is null;

create table public.registration_operation_receipts (
  operation_kind public.registration_operation_kind not null,
  scope_id uuid not null,
  operation_id uuid not null,
  payload_hash text not null,
  sanitized_result jsonb not null,
  created_at timestamptz not null default now(),
  -- An operation UUID is single-use within a workflow scope, including across
  -- operation kinds, so callers cannot reinterpret a prior idempotency key.
  primary key (scope_id, operation_id),
  constraint registration_operation_receipts_payload_hash
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint registration_operation_receipts_result_object
    check (pg_catalog.jsonb_typeof(sanitized_result) = 'object')
);
create index registration_operation_receipts_cleanup_idx
  on public.registration_operation_receipts (created_at, scope_id, operation_id);

-- ---------------------------------------------------------------------------
-- Immutability + updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.reject_registration_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'REGISTRATION_EVENT_IMMUTABLE';
end;
$$;

create trigger registration_stage_events_reject_mutation
  before update or delete on public.registration_stage_events
  for each row execute function public.reject_registration_event_mutation();
create trigger registration_stage_events_reject_truncate
  before truncate on public.registration_stage_events
  for each statement execute function public.reject_registration_event_mutation();
create trigger registration_visa_events_reject_mutation
  before update or delete on public.registration_visa_events
  for each row execute function public.reject_registration_event_mutation();
create trigger registration_visa_events_reject_truncate
  before truncate on public.registration_visa_events
  for each statement execute function public.reject_registration_event_mutation();

create or replace function public.guard_registration_domain_event_consumption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_DOMAIN_EVENT_IMMUTABLE';
  end if;
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_DOMAIN_EVENT_IMMUTABLE';
  end if;

  if old.consumed_at is not null
     or new.consumed_at is null
     or row(
       new.id,
       new.event_code,
       new.registration_id,
       new.tenant_id,
       new.company_id,
       new.payload,
       new.occurred_at
     ) is distinct from row(
       old.id,
       old.event_code,
       old.registration_id,
       old.tenant_id,
       old.company_id,
       old.payload,
       old.occurred_at
     ) then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_DOMAIN_EVENT_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger registration_domain_events_guard_consumption
  before update or delete on public.registration_domain_events
  for each row execute function public.guard_registration_domain_event_consumption();
create trigger registration_domain_events_reject_truncate
  before truncate on public.registration_domain_events
  for each statement execute function public.guard_registration_domain_event_consumption();

create trigger company_registrations_set_updated_at
  before update on public.company_registrations
  for each row execute function public.set_updated_at();
create trigger registration_stages_set_updated_at
  before update on public.registration_stages
  for each row execute function public.set_updated_at();
create trigger registration_visa_people_set_updated_at
  before update on public.registration_visa_people
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fail-closed legacy backfill.
-- Generic service-case status is not registration workflow authority. Refuse an
-- ambiguous legacy company instead of silently omitting a case or inventing a
-- terminal registration mapping; reconciliation must happen before reapplying.
-- ---------------------------------------------------------------------------
do $$
declare
  v_duplicate_company_count bigint;
begin
  select count(*) into v_duplicate_company_count
  from (
    select service_case.tenant_id, service_case.company_id
    from public.service_cases as service_case
    where service_case.service_type = 'company_registration'
    group by service_case.tenant_id, service_case.company_id
    having count(*) > 1
  ) as duplicate_company;

  if v_duplicate_company_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_REGISTRATION_RECONCILIATION_REQUIRED',
      detail = pg_catalog.format('duplicate_company_count=%s', v_duplicate_company_count);
  end if;
end;
$$;

-- When ownership is unambiguous, preserve every legacy registration case as an
-- untouched draft workflow with seven not-started stages.
insert into public.company_registrations (service_case_id, tenant_id, company_id)
select service_case.id, service_case.tenant_id, service_case.company_id
from public.service_cases as service_case
where service_case.service_type = 'company_registration'
on conflict (service_case_id) do nothing;

insert into public.registration_stages (
  registration_id, tenant_id, company_id, code, ordinal
)
select registration.id, registration.tenant_id, registration.company_id,
       stage.code::public.registration_stage_code, stage.ordinal
from public.company_registrations as registration
cross join (values
  ('application_submitted', 1),
  ('initial_approval', 2),
  ('name_reservation', 3),
  ('license_issuance', 4),
  ('visa_processing', 5),
  ('bank_account', 6),
  ('completed', 7)
) as stage(code, ordinal)
join public.service_cases as service_case
  on service_case.id = registration.service_case_id
 and service_case.tenant_id = registration.tenant_id
 and service_case.company_id = registration.company_id
where service_case.service_type = 'company_registration'
on conflict (registration_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Audit action check: forward drop + re-add including every existing action
-- (from 0065) plus the five new registration actions.
-- ---------------------------------------------------------------------------
alter table public.tenant_audit_log drop constraint tenant_audit_log_action_check;
alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check check (action in (
    'created', 'approved', 'rejected', 'suspended', 'reactivated', 'updated', 'completed',
    'cancelled', 'unlocked', 'session_revoked', 'invoice_created', 'invoice_voided',
    'invoice_marked_paid', 'payment_initiated', 'payment_succeeded', 'payment_failed',
    'refund_issued', 'infected_blocked', 'reconciled', 'comms_skipped_opted_out',
    'lead_created', 'lead_assigned', 'lead_stage_changed', 'lead_note_added',
    'erasure_requested', 'erasure_verified', 'erasure_approved', 'erasure_rejected',
    'erasure_completed', 'bulk_imported', 'meeting_slot_created', 'meeting_scheduled',
    'meeting_cancelled', 'meeting_completed', 'meeting_recording_attached',
    'whatsapp_template_status_updated', 'service_case_created', 'service_case_updated',
    'company_pro_assigned', 'company_pro_released', 'company_onboarding_section_saved',
    'company_onboarding_section_completed', 'company_onboarding_section_reopened',
    'company_shareholders_replaced', 'company_activities_replaced',
    'company_bank_identifier_updated', 'company_bank_identifier_cleared',
    'company_onboarding_submitted', 'company_activation_attempted', 'company_activated',
    'registration_created', 'registration_stage_changed', 'registration_document_linked',
    'registration_document_unlinked', 'registration_visa_changed'
  ));

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- RLS model: all writes are service-role only (the SECURITY DEFINER command
-- RPCs). There are intentionally NO INSERT/UPDATE/DELETE policies for role
-- 'authenticated'. Only read policies exist for authenticated principals, and
-- every one resolves scope from live DB state (assignments / customer link /
-- employee link) via auth.uid() joins -- never from JWT claims. Operators read
-- exclusively through the service-role read RPC (no authenticated policy).
-- ---------------------------------------------------------------------------
alter table public.company_registrations enable row level security;
alter table public.registration_stages enable row level security;
alter table public.registration_stage_documents enable row level security;
alter table public.registration_visa_people enable row level security;
alter table public.registration_stage_events enable row level security;
alter table public.registration_visa_events enable row level security;
alter table public.registration_domain_events enable row level security;
alter table public.registration_operation_receipts enable row level security;

-- PRO: read within an active assignment to the owning company.
create policy company_registrations_pro_read on public.company_registrations for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = company_registrations.tenant_id
        and assignment.company_id = company_registrations.company_id
        and assignment.status = 'active'
    )
  );
-- Customer: read as a linked customer of the owning company.
create policy company_registrations_customer_read on public.company_registrations for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.profiles p
      join public.customer_profiles customer on customer.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.status = 'active'
        and p.tenant_id = company_registrations.tenant_id
        and customer.linked_company_id = company_registrations.company_id
    )
  );

create policy registration_stages_pro_read on public.registration_stages for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = registration_stages.tenant_id
        and assignment.company_id = registration_stages.company_id
        and assignment.status = 'active'
    )
  );
create policy registration_stages_customer_read on public.registration_stages for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.profiles p
      join public.customer_profiles customer on customer.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.status = 'active'
        and p.tenant_id = registration_stages.tenant_id
        and customer.linked_company_id = registration_stages.company_id
    )
  );

create policy registration_stage_documents_pro_read on public.registration_stage_documents for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = registration_stage_documents.tenant_id
        and assignment.company_id = registration_stage_documents.company_id
        and assignment.status = 'active'
    )
  );
create policy registration_stage_documents_customer_read on public.registration_stage_documents for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.profiles p
      join public.customer_profiles customer on customer.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.status = 'active'
        and p.tenant_id = registration_stage_documents.tenant_id
        and customer.linked_company_id = registration_stage_documents.company_id
    )
  );

create policy registration_visa_people_pro_read on public.registration_visa_people for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = registration_visa_people.tenant_id
        and assignment.company_id = registration_visa_people.company_id
        and assignment.status = 'active'
    )
  );
create policy registration_visa_people_customer_read on public.registration_visa_people for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.profiles p
      join public.customer_profiles customer on customer.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.status = 'active'
        and p.tenant_id = registration_visa_people.tenant_id
        and customer.linked_company_id = registration_visa_people.company_id
    )
  );
-- Employee: read ONLY their own visa person row, resolved via the employee link
-- (employees.profile_id = auth.uid()). No employee sees any other row.
create policy registration_visa_people_employee_self_read on public.registration_visa_people for select
  using (
    public.has_company_access(tenant_id)
    and registration_visa_people.employee_id is not null
    and exists (
      select 1 from public.employees e
      where e.id = registration_visa_people.employee_id
        and e.tenant_id = registration_visa_people.tenant_id
        and e.company_id = registration_visa_people.company_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy registration_stage_events_pro_read on public.registration_stage_events for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = registration_stage_events.tenant_id
        and assignment.company_id = registration_stage_events.company_id
        and assignment.status = 'active'
    )
  );

create policy registration_visa_events_pro_read on public.registration_visa_events for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.pro_company_assignments assignment
      where assignment.pro_profile_id = auth.uid()
        and assignment.tenant_id = registration_visa_events.tenant_id
        and assignment.company_id = registration_visa_events.company_id
        and assignment.status = 'active'
    )
  );

-- registration_domain_events and registration_operation_receipts carry no
-- authenticated read policy: they are internal projection/idempotency state
-- consumed only through the service-role layer.

-- ---------------------------------------------------------------------------
-- Table grants: workflow tables are reachable only through SECURITY DEFINER
-- RPCs (which run as owner) and the read policies above; no direct DML grants.
-- ---------------------------------------------------------------------------
revoke all on table public.company_registrations from public, anon, authenticated, service_role;
revoke all on table public.registration_stages from public, anon, authenticated, service_role;
revoke all on table public.registration_stage_documents from public, anon, authenticated, service_role;
revoke all on table public.registration_visa_people from public, anon, authenticated, service_role;
revoke all on table public.registration_stage_events from public, anon, authenticated, service_role;
revoke all on table public.registration_visa_events from public, anon, authenticated, service_role;
revoke all on table public.registration_domain_events from public, anon, authenticated, service_role;
revoke all on table public.registration_operation_receipts from public, anon, authenticated, service_role;
-- Read policies require the base SELECT privilege for authenticated principals.
grant select on table public.company_registrations to authenticated;
grant select on table public.registration_stages to authenticated;
grant select on table public.registration_stage_documents to authenticated;
grant select on table public.registration_visa_people to authenticated;
grant select on table public.registration_stage_events to authenticated;
grant select on table public.registration_visa_events to authenticated;

revoke all on function public.reject_registration_event_mutation()
  from public, anon, authenticated;
revoke all on function public.guard_registration_domain_event_consumption()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Domain-event contracts + consumer registrations (0105 template).
-- Reference-only payloads: ids ('uuid'), codes/state ('state'). No PII, paths,
-- URLs, or free text. Emitted with privacy_class 'restricted'.
-- ---------------------------------------------------------------------------
insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('registration.created', 1,
    '{"resource_id":"uuid","company_id":"uuid","operation_id":"uuid","status":"state","stage_code":"state","version":"integer"}'),
  ('registration.stage_changed', 1,
    '{"resource_id":"uuid","company_id":"uuid","stage_code":"state","from_stage_status":"state","to_stage_status":"state","from_registration_stage":"state","to_registration_stage":"state","transition_code":"state","registration_status":"state","version":"integer"}'),
  ('registration.stage_blocked', 1,
    '{"resource_id":"uuid","company_id":"uuid","stage_code":"state","reason_code":"state","registration_status":"state","version":"integer"}'),
  ('registration.evidence_linked', 1,
    '{"resource_id":"uuid","company_id":"uuid","stage_id":"uuid","document_id":"uuid","document_version_id":"uuid","role":"state"}'),
  ('registration.visa_changed', 1,
    '{"resource_id":"uuid","company_id":"uuid","visa_person_id":"uuid","stage_code":"state","status":"state","change":"state","version":"integer"}'),
  ('registration.completed', 1,
    '{"resource_id":"uuid","company_id":"uuid","status":"state","version":"integer"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled
)
select 'internal.lifecycle.projection', event_type, event_version, 5, 120, true
from public.event_contract_registrations
where event_type in (
  'registration.created',
  'registration.stage_changed',
  'registration.stage_blocked',
  'registration.evidence_linked',
  'registration.visa_changed',
  'registration.completed'
);

create function private.p306_event_uuid(p_seed text)
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

create function private.publish_p306_event(
  p_source text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed text := p_event_type || ':1:' || p_source;
begin
  perform public.publish_domain_event(
    private.p306_event_uuid(v_seed),
    p_event_type,
    1::smallint,
    p_occurred_at,
    p_tenant_id,
    p_company_id,
    p_actor_id,
    p_correlation_id,
    null::uuid,
    'restricted'::text,
    p_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_seed, 'UTF8')), 'hex')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotency helpers
-- ---------------------------------------------------------------------------
create function public.registration_replay_result(
  p_operation_kind public.registration_operation_kind,
  p_scope_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.registration_operation_receipts%rowtype;
begin
  if p_scope_id is null or p_operation_id is null or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_OPERATION';
  end if;
  select * into v_receipt
  from public.registration_operation_receipts
  where scope_id = p_scope_id and operation_id = p_operation_id
  for update;
  if not found then return null; end if;
  if v_receipt.operation_kind <> p_operation_kind
     or v_receipt.payload_hash <> p_payload_hash then
    raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
  end if;
  return v_receipt.sanitized_result;
end;
$$;

create function public.store_registration_receipt(
  p_operation_kind public.registration_operation_kind,
  p_scope_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_sanitized_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sanitized_result is null
     or pg_catalog.jsonb_typeof(p_sanitized_result) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_OPERATION_RESULT';
  end if;
  insert into public.registration_operation_receipts (
    operation_kind, scope_id, operation_id, payload_hash, sanitized_result
  ) values (
    p_operation_kind, p_scope_id, p_operation_id, p_payload_hash, p_sanitized_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: create_company_registration
-- ---------------------------------------------------------------------------
create function public.create_company_registration(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_title text,
  p_priority text,
  p_due_at timestamptz,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_registration_id uuid := gen_random_uuid();
  v_service_case_id uuid := gen_random_uuid();
  v_stage_id uuid;
  v_title text := pg_catalog.btrim(p_title);
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 2 and 160
     or p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 88008)
  );

  v_result := public.registration_replay_result(
    'create_registration', p_company_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;

  perform 1 from public.company_profiles company
  join public.tenants tenant on tenant.id = company.tenant_id
  where company.id = p_company_id and company.tenant_id = p_tenant_id
    and company.status not in ('suspended', 'churned') and tenant.status <> 'suspended'
  for update of company, tenant;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;
  select assignment.id into v_assignment_id
  from public.pro_company_assignments assignment
  where assignment.pro_profile_id = p_actor_id
    and assignment.tenant_id = p_tenant_id
    and assignment.company_id = p_company_id
    and assignment.status = 'active'
  for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  perform 1 from public.pro_credentials credential
  where credential.pro_profile_id = p_actor_id
    and credential.credential_type = 'pro_license'
    and credential.state = 'verified'
    and credential.expiry_date >= pg_catalog.timezone('Asia/Dubai', pg_catalog.now())::date
  order by credential.id for update;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if exists (
    select 1 from public.company_registrations registration
    where registration.tenant_id = p_tenant_id and registration.company_id = p_company_id
      and registration.status in ('draft', 'in_progress', 'blocked')
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_REGISTRATION_EXISTS';
  end if;

  insert into public.service_cases (
    id, tenant_id, company_id, title, service_type, status, priority,
    assigned_to, due_at, created_by
  ) values (
    v_service_case_id, p_tenant_id, p_company_id, v_title,
    'company_registration', 'documents_pending', p_priority,
    p_actor_id, p_due_at, p_actor_id
  );
  insert into public.company_registrations (
    id, service_case_id, tenant_id, company_id, status, current_stage,
    version, started_at
  ) values (
    v_registration_id, v_service_case_id, p_tenant_id, p_company_id,
    'in_progress', 'application_submitted', 1, pg_catalog.now()
  );
  insert into public.registration_stages (
    registration_id, tenant_id, company_id, code, ordinal, status,
    version, started_at
  )
  select v_registration_id, p_tenant_id, p_company_id,
         stage.code::public.registration_stage_code, stage.ordinal,
         case when stage.ordinal = 1 then 'in_progress'
              else 'not_started' end::public.registration_stage_status,
         case when stage.ordinal = 1 then 1 else 0 end,
         case when stage.ordinal = 1 then pg_catalog.now() else null end
  from (values
    ('application_submitted', 1), ('initial_approval', 2),
    ('name_reservation', 3), ('license_issuance', 4),
    ('visa_processing', 5), ('bank_account', 6), ('completed', 7)
  ) as stage(code, ordinal);
  select id into strict v_stage_id from public.registration_stages
  where registration_id = v_registration_id and code = 'application_submitted';

  insert into public.registration_stage_events (
    registration_id, stage_id, tenant_id, company_id, from_stage_status,
    to_stage_status, from_registration_stage, to_registration_stage,
    transition_code, operation_id, actor_id, registration_version, stage_version
  ) values (
    v_registration_id, v_stage_id, p_tenant_id, p_company_id, null,
    'in_progress', null, 'application_submitted', 'started',
    p_operation_id, p_actor_id, 1, 1
  );
  insert into public.registration_domain_events (
    event_code, registration_id, tenant_id, company_id, payload
  ) values (
    'registration_stage_changed', v_registration_id, p_tenant_id, p_company_id,
    pg_catalog.jsonb_build_object(
      'registrationStatus', 'in_progress', 'stageCode', 'application_submitted',
      'fromStageStatus', null, 'toStageStatus', 'in_progress',
      'fromRegistrationStage', null, 'toRegistrationStage', 'application_submitted',
      'transitionCode', 'started'
    )
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_created', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', v_registration_id, 'service_case_id', v_service_case_id,
      'company_id', p_company_id, 'assignment_id', v_assignment_id
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || v_registration_id::text ||
      ':operation:' || p_operation_id::text || ':version:1',
    'registration.created', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', v_registration_id, 'company_id', p_company_id,
      'operation_id', p_operation_id, 'status', 'in_progress',
      'stage_code', 'application_submitted', 'version', 1
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', v_registration_id, 'serviceCaseId', v_service_case_id,
    'status', 'in_progress', 'currentStage', 'application_submitted',
    'registrationVersion', 1, 'currentStageVersion', 1
  );
  perform public.store_registration_receipt(
    'create_registration', p_company_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'ACTIVE_REGISTRATION_EXISTS';
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: transition_registration_stage
--
-- Status-only changes (block/unblock) keep from_registration_stage ==
-- to_registration_stage == the current stage; stage advances move
-- to_registration_stage to the next stage. The emitted stage/domain event
-- carries a transition_code so consumers distinguish the two without inferring
-- intent from the from/to stage pair.
-- ---------------------------------------------------------------------------
create function public.transition_registration_stage(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_stage_id uuid,
  p_command text,
  p_expected_registration_version bigint,
  p_expected_stage_version bigint,
  p_details jsonb,
  p_reason_code text,
  p_reason_text text,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.company_registrations%rowtype;
  v_stage public.registration_stages%rowtype;
  v_from_status public.registration_stage_status;
  v_to_status public.registration_stage_status;
  v_to_registration_stage public.registration_stage_code;
  v_registration_status public.registration_status;
  v_transition_code text;
  v_reason_code text := pg_catalog.upper(pg_catalog.btrim(p_reason_code));
  v_reason_text text := pg_catalog.btrim(p_reason_text);
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_result jsonb;
  v_require_reason boolean;
  v_has_required_document boolean;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_command is null
     or p_command not in ('start', 'block', 'unblock', 'complete', 'skip', 'recover')
     or pg_catalog.jsonb_typeof(v_details) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_STAGE_COMMAND';
  end if;
  v_require_reason := p_command in ('block', 'unblock', 'skip', 'recover');
  if v_require_reason and (
    v_reason_code is null or v_reason_code not in (
      'AUTHORITY_DELAY', 'CUSTOMER_ACTION_REQUIRED', 'DOCUMENT_CORRECTION_REQUIRED',
      'BANK_REVIEW', 'AUTHORITY_RESUMED', 'CUSTOMER_ACTION_COMPLETED',
      'DOCUMENT_CORRECTED', 'BANK_REVIEW_RESUMED', 'NOT_APPLICABLE',
      'CUSTOMER_DECLINED', 'OPERATOR_RECOVERY'
    ) or v_reason_text is null or pg_catalog.char_length(v_reason_text) not between 3 and 500
  ) then
    raise exception using errcode = '22023', message = 'INVALID_STAGE_REASON';
  end if;
  if not v_require_reason and (p_reason_code is not null or p_reason_text is not null) then
    raise exception using errcode = '22023', message = 'INVALID_STAGE_REASON';
  end if;

  v_result := public.registration_replay_result(
    'transition_stage', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_registration from public.company_registrations registration
  where registration.id = p_registration_id
    and registration.tenant_id = p_tenant_id and registration.company_id = p_company_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  select * into v_stage from public.registration_stages stage
  where stage.id = p_stage_id and stage.registration_id = p_registration_id
    and stage.tenant_id = p_tenant_id and stage.company_id = p_company_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'STAGE_NOT_FOUND'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'transition_stage', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if p_expected_registration_version is null
     or v_registration.version <> p_expected_registration_version then
    raise exception using errcode = 'P0001', message = 'STALE_REGISTRATION_VERSION';
  end if;
  if p_expected_stage_version is null or v_stage.version <> p_expected_stage_version then
    raise exception using errcode = 'P0001', message = 'STALE_STAGE_VERSION';
  end if;
  if p_command <> 'complete' then
    if private.jsonb_key_count(v_details) <> 0 then
      raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
    end if;
  elsif v_stage.code = 'application_submitted' then
    if private.jsonb_key_count(v_details) <> 1
       or not (v_details ? 'applicationSubmittedOn')
       or pg_catalog.jsonb_typeof(v_details -> 'applicationSubmittedOn') <> 'string'
       or (v_details ->> 'applicationSubmittedOn') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
    end if;
  elsif v_stage.code = 'initial_approval' then
    if private.jsonb_key_count(v_details) <> 1
       or not (v_details ? 'approvalReceivedOn')
       or pg_catalog.jsonb_typeof(v_details -> 'approvalReceivedOn') <> 'string'
       or (v_details ->> 'approvalReceivedOn') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
    end if;
  elsif v_stage.code = 'name_reservation' then
    if private.jsonb_key_count(v_details) <> 3
       or not (v_details ?& array['nameOptions', 'approvedName', 'approvedNameVersion'])
       or pg_catalog.jsonb_typeof(v_details -> 'nameOptions') <> 'array'
       or pg_catalog.jsonb_array_length(v_details -> 'nameOptions') not between 1 and 5
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(v_details -> 'nameOptions') option_value
         where pg_catalog.jsonb_typeof(option_value) <> 'string'
            or pg_catalog.char_length(pg_catalog.btrim(option_value #>> '{}')) not between 2 and 200
       )
       or pg_catalog.jsonb_typeof(v_details -> 'approvedName') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(v_details ->> 'approvedName')) not between 2 and 200
       or pg_catalog.jsonb_typeof(v_details -> 'approvedNameVersion') <> 'number'
       or (v_details ->> 'approvedNameVersion') !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
    end if;
  elsif v_stage.code = 'bank_account' then
    if private.jsonb_key_count(v_details) <> 1
       or not (v_details ? 'bankStatus')
       or pg_catalog.jsonb_typeof(v_details -> 'bankStatus') <> 'string'
       or v_details ->> 'bankStatus' <> 'opened' then
      raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
    end if;
  elsif private.jsonb_key_count(v_details) <> 0 then
    raise exception using errcode = '22023', message = 'INVALID_STAGE_DETAILS';
  end if;
  if v_registration.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_TERMINAL';
  end if;
  if p_command = 'complete' and v_stage.status in ('completed', 'skipped') then
    raise exception using errcode = 'P0001', message = 'STAGE_ALREADY_TERMINAL';
  end if;
  if v_stage.code <> v_registration.current_stage then
    raise exception using errcode = 'P0001', message = 'ILLEGAL_STAGE_ORDER';
  end if;
  if exists (
    select 1 from public.registration_stages predecessor
    where predecessor.registration_id = p_registration_id
      and predecessor.ordinal < v_stage.ordinal
      and predecessor.status not in ('completed', 'skipped')
  ) then
    raise exception using errcode = 'P0001', message = 'ILLEGAL_STAGE_ORDER';
  end if;

  v_from_status := v_stage.status;
  v_to_registration_stage := v_registration.current_stage;
  v_registration_status := v_registration.status;
  if p_command = 'start' then
    if v_stage.status <> 'not_started' then
      raise exception using errcode = 'P0001', message = 'INVALID_STAGE_TRANSITION';
    end if;
    v_to_status := 'in_progress';
    v_transition_code := 'started';
  elsif p_command = 'block' then
    if v_stage.status <> 'in_progress' then
      raise exception using errcode = 'P0001', message = 'INVALID_STAGE_TRANSITION';
    end if;
    v_to_status := 'blocked';
    v_registration_status := 'blocked';
    v_transition_code := 'blocked';
  elsif p_command in ('unblock', 'recover') then
    if v_stage.status <> 'blocked' then
      raise exception using errcode = 'P0001', message = 'INVALID_STAGE_TRANSITION';
    end if;
    v_to_status := 'in_progress';
    v_registration_status := 'in_progress';
    v_transition_code := 'unblocked';
  elsif p_command = 'skip' then
    if v_stage.code not in ('visa_processing', 'bank_account') then
      raise exception using errcode = 'P0001', message = 'STAGE_SKIP_FORBIDDEN';
    end if;
    if v_stage.status not in ('not_started', 'in_progress') then
      raise exception using errcode = 'P0001', message = 'INVALID_STAGE_TRANSITION';
    end if;
    v_to_status := 'skipped';
    v_transition_code := 'skipped';
  else
    if v_stage.status <> 'in_progress' then
      if v_stage.status in ('completed', 'skipped') then
        raise exception using errcode = 'P0001', message = 'STAGE_ALREADY_TERMINAL';
      end if;
      raise exception using errcode = 'P0001', message = 'INVALID_STAGE_TRANSITION';
    end if;
    v_to_status := 'completed';
    v_transition_code := 'completed';

    if v_stage.code = 'application_submitted' then
      select exists (
        select 1 from public.registration_stage_documents link
        join public.document_versions document_version
          on document_version.id = link.document_version_id
         and document_version.document_id = link.document_id
         and document_version.tenant_id = link.tenant_id
        where link.stage_id = v_stage.id and link.registration_id = p_registration_id
          and link.role = 'application_form' and document_version.review_status = 'approved'
      ) into v_has_required_document;
      if not v_has_required_document
         or coalesce(v_details ->> 'applicationSubmittedOn', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'initial_approval' then
      select exists (
        select 1 from public.registration_stage_documents link
        join public.document_versions document_version
          on document_version.id = link.document_version_id
         and document_version.document_id = link.document_id
         and document_version.tenant_id = link.tenant_id
        where link.stage_id = v_stage.id and link.registration_id = p_registration_id
          and link.role = 'approval_letter' and document_version.review_status = 'approved'
      ) into v_has_required_document;
      if not v_has_required_document
         or coalesce(v_details ->> 'approvalReceivedOn', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'name_reservation' then
      if pg_catalog.jsonb_typeof(v_details -> 'nameOptions') <> 'array'
         or pg_catalog.jsonb_array_length(v_details -> 'nameOptions') = 0
         or pg_catalog.char_length(pg_catalog.btrim(coalesce(v_details ->> 'approvedName', ''))) not between 2 and 200
         or coalesce(v_details ->> 'approvedNameVersion', '') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'license_issuance' then
      select exists (
        select 1 from public.registration_stage_documents link
        join public.document_versions document_version
          on document_version.id = link.document_version_id
         and document_version.document_id = link.document_id
         and document_version.tenant_id = link.tenant_id
        where link.stage_id = v_stage.id and link.registration_id = p_registration_id
          and link.role = 'trade_license' and document_version.review_status = 'approved'
      ) into v_has_required_document;
      if not v_has_required_document or exists (
        select 1 from public.company_profiles company
        where company.id = p_company_id and (
          company.licensing_authority is null or company.jurisdiction_type is null
          or company.legal_structure is null or company.trade_license_no is null
          or company.license_expiry is null
        )
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'visa_processing' then
      if not exists (
        select 1 from public.registration_visa_people person
        where person.registration_id = p_registration_id and person.status <> 'cancelled'
      ) or exists (
        select 1 from public.registration_visa_people person
        where person.registration_id = p_registration_id and person.status <> 'cancelled'
          and (person.status <> 'completed' or person.current_stage <> 'residency_issued')
      ) then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'bank_account' then
      select exists (
        select 1 from public.registration_stage_documents link
        join public.document_versions document_version
          on document_version.id = link.document_version_id
         and document_version.document_id = link.document_id
         and document_version.tenant_id = link.tenant_id
        where link.stage_id = v_stage.id and link.registration_id = p_registration_id
          and link.role = 'bank_evidence' and document_version.review_status = 'approved'
      ) into v_has_required_document;
      if v_details ->> 'bankStatus' <> 'opened' or not v_has_required_document then
        raise exception using errcode = 'P0001', message = 'STAGE_REQUIREMENTS_INCOMPLETE';
      end if;
    elsif v_stage.code = 'completed' and exists (
      select 1 from public.registration_stages predecessor
      where predecessor.registration_id = p_registration_id and predecessor.ordinal < 7
        and predecessor.status not in ('completed', 'skipped')
    ) then
      raise exception using errcode = 'P0001', message = 'REGISTRATION_COMPLETION_BLOCKED';
    end if;
  end if;

  if v_to_status in ('completed', 'skipped') then
    if v_stage.ordinal = 7 then
      v_to_registration_stage := 'completed';
      v_registration_status := 'completed';
    else
      select code into strict v_to_registration_stage
      from public.registration_stages next_stage
      where next_stage.registration_id = p_registration_id
        and next_stage.ordinal = v_stage.ordinal + 1;
      v_registration_status := 'in_progress';
    end if;
    -- Advancing past a completed/skipped stage relabels the transition; a stage
    -- 7 completion is a whole-registration completion.
    v_transition_code := case when v_stage.ordinal = 7 then 'completed' else 'advanced' end;
  end if;

  update public.registration_stages set
    status = v_to_status,
    details = details || v_details,
    version = version + 1,
    started_at = case when started_at is null then pg_catalog.now() else started_at end,
    completed_at = case when v_to_status in ('completed', 'skipped')
                        then pg_catalog.now() else null end
  where id = v_stage.id;
  update public.company_registrations set
    status = v_registration_status,
    current_stage = v_to_registration_stage,
    version = version + 1,
    completed_at = case when v_registration_status = 'completed'
                        then pg_catalog.now() else null end
  where id = p_registration_id;
  update public.service_cases set
    status = case
      when v_registration_status = 'completed' then 'completed'
      when v_to_registration_stage = 'completed' then 'approved'
      when v_stage.ordinal <= 1 then 'documents_pending'
      when v_stage.ordinal = 2 then 'ready_to_submit'
      when v_stage.ordinal = 3 then 'submitted'
      else 'authority_review'
    end,
    blocked_reason = case when v_registration_status = 'blocked' then v_reason_text else null end,
    completed_at = case when v_registration_status = 'completed' then pg_catalog.now() else null end
  where id = v_registration.service_case_id;

  insert into public.registration_stage_events (
    registration_id, stage_id, tenant_id, company_id, from_stage_status,
    to_stage_status, from_registration_stage, to_registration_stage,
    transition_code, reason_code, reason_text, operation_id, actor_id,
    registration_version, stage_version
  ) values (
    p_registration_id, p_stage_id, p_tenant_id, p_company_id, v_from_status,
    v_to_status, v_registration.current_stage, v_to_registration_stage,
    v_transition_code,
    case when v_require_reason then v_reason_code else null end,
    case when v_require_reason then v_reason_text else null end,
    p_operation_id, p_actor_id, v_registration.version + 1, v_stage.version + 1
  );
  insert into public.registration_domain_events (
    event_code, registration_id, tenant_id, company_id, payload
  ) values (
    'registration_stage_changed', p_registration_id, p_tenant_id, p_company_id,
    pg_catalog.jsonb_build_object(
      'registrationStatus', v_registration_status::text,
      'stageCode', v_stage.code::text,
      'fromStageStatus', v_from_status::text,
      'toStageStatus', v_to_status::text,
      'fromRegistrationStage', v_registration.current_stage::text,
      'toRegistrationStage', v_to_registration_stage::text,
      'transitionCode', v_transition_code
    )
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_stage_changed', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'stage_id', p_stage_id,
      'command', p_command, 'to_status', v_to_status::text,
      'transition_code', v_transition_code,
      'reason_code', case when v_require_reason then v_reason_code else null end
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || p_registration_id::text ||
      ':operation:' || p_operation_id::text ||
      ':version:' || (v_registration.version + 1)::text,
    'registration.stage_changed', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_registration_id, 'company_id', p_company_id,
      'stage_code', v_stage.code::text,
      'from_stage_status', v_from_status::text,
      'to_stage_status', v_to_status::text,
      'from_registration_stage', v_registration.current_stage::text,
      'to_registration_stage', v_to_registration_stage::text,
      'transition_code', v_transition_code,
      'registration_status', v_registration_status::text,
      'version', v_registration.version + 1
    )
  );
  if v_transition_code = 'blocked' then
    perform private.publish_p306_event(
      'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
        ':resource:' || p_registration_id::text ||
        ':operation:' || p_operation_id::text ||
        ':version:' || (v_registration.version + 1)::text || ':blocked',
      'registration.stage_blocked', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
      p_operation_id,
      pg_catalog.jsonb_build_object(
        'resource_id', p_registration_id, 'company_id', p_company_id,
        'stage_code', v_stage.code::text,
        'reason_code', pg_catalog.lower(v_reason_code),
        'registration_status', v_registration_status::text,
        'version', v_registration.version + 1
      )
    );
  end if;
  if v_registration_status = 'completed' then
    perform private.publish_p306_event(
      'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
        ':resource:' || p_registration_id::text ||
        ':operation:' || p_operation_id::text ||
        ':version:' || (v_registration.version + 1)::text || ':completed',
      'registration.completed', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
      p_operation_id,
      pg_catalog.jsonb_build_object(
        'resource_id', p_registration_id, 'company_id', p_company_id,
        'status', 'completed', 'version', v_registration.version + 1
      )
    );
  end if;
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'stageId', p_stage_id,
    'stageCode', v_stage.code::text, 'stageStatus', v_to_status::text,
    'status', v_registration_status::text,
    'currentStage', v_to_registration_stage::text,
    'transitionCode', v_transition_code,
    'registrationVersion', v_registration.version + 1,
    'stageVersion', v_stage.version + 1
  );
  perform public.store_registration_receipt(
    'transition_stage', p_registration_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: link_registration_stage_document
-- ---------------------------------------------------------------------------
create function public.link_registration_stage_document(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_stage_id uuid,
  p_document_id uuid,
  p_document_version_id uuid,
  p_role public.registration_document_role,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.company_registrations%rowtype;
  v_stage public.registration_stages%rowtype;
  v_link_id uuid;
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'link_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_registration from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  select * into v_stage from public.registration_stages stage
  where stage.id = p_stage_id and stage.registration_id = p_registration_id
    and stage.tenant_id = p_tenant_id and stage.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'STAGE_NOT_FOUND'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'link_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if v_registration.status in ('completed', 'cancelled')
     or v_stage.status in ('completed', 'skipped') then
    raise exception using errcode = 'P0001', message = 'STAGE_ALREADY_TERMINAL';
  end if;
  perform 1 from public.documents document
  join public.document_versions document_version
    on document_version.id = p_document_version_id
   and document_version.tenant_id = document.tenant_id
   and document_version.document_id = document.id
  where document.id = p_document_id and document.tenant_id = p_tenant_id
    and document.company_id = p_company_id
    and document_version.review_status = 'approved'
  for update of document, document_version;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_NOT_APPROVED';
  end if;
  if p_role is null or not (
    (v_stage.code = 'application_submitted' and p_role = 'application_form')
    or (v_stage.code = 'initial_approval' and p_role = 'approval_letter')
    or (v_stage.code = 'name_reservation' and p_role = 'trade_name_approval')
    or (v_stage.code = 'license_issuance' and p_role = 'trade_license')
    or (v_stage.code = 'visa_processing' and p_role in ('visa_evidence', 'other'))
    or (v_stage.code = 'bank_account' and p_role = 'bank_evidence')
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ROLE_FORBIDDEN';
  end if;
  if exists (
    select 1 from public.registration_stage_documents link
    where link.stage_id = p_stage_id and link.document_version_id = p_document_version_id
      and link.role = p_role
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ALREADY_LINKED';
  end if;
  insert into public.registration_stage_documents (
    registration_id, stage_id, tenant_id, company_id, document_id,
    document_version_id, role, linked_by
  ) values (
    p_registration_id, p_stage_id, p_tenant_id, p_company_id, p_document_id,
    p_document_version_id, p_role, p_actor_id
  ) returning id into v_link_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_document_linked', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'stage_id', p_stage_id,
      'link_id', v_link_id, 'document_id', p_document_id,
      'document_version_id', p_document_version_id, 'role', p_role::text
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || p_registration_id::text ||
      ':operation:' || p_operation_id::text || ':link:' || v_link_id::text,
    'registration.evidence_linked', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_registration_id, 'company_id', p_company_id,
      'stage_id', p_stage_id, 'document_id', p_document_id,
      'document_version_id', p_document_version_id, 'role', p_role::text
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'stageId', p_stage_id,
    'linkId', v_link_id, 'documentId', p_document_id,
    'documentVersionId', p_document_version_id, 'role', p_role::text
  );
  perform public.store_registration_receipt(
    'link_document', p_registration_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: unlink_registration_stage_document (PRO path)
-- ---------------------------------------------------------------------------
create function public.unlink_registration_stage_document(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_stage_id uuid,
  p_link_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.registration_stages%rowtype;
  v_link public.registration_stage_documents%rowtype;
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'unlink_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  perform 1 from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  select * into v_stage from public.registration_stages stage
  where stage.id = p_stage_id and stage.registration_id = p_registration_id
    and stage.tenant_id = p_tenant_id and stage.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'STAGE_NOT_FOUND'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'unlink_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if v_stage.status in ('completed', 'skipped') then
    raise exception using errcode = 'P0001', message = 'COMPLETED_STAGE_EVIDENCE_IMMUTABLE';
  end if;
  select * into v_link from public.registration_stage_documents link
  where link.id = p_link_id and link.registration_id = p_registration_id
    and link.stage_id = p_stage_id and link.tenant_id = p_tenant_id
    and link.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DOCUMENT_LINK_NOT_FOUND'; end if;
  delete from public.registration_stage_documents where id = p_link_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_document_unlinked', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'stage_id', p_stage_id,
      'link_id', p_link_id, 'document_id', v_link.document_id,
      'document_version_id', v_link.document_version_id, 'recovery', false
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'stageId', p_stage_id,
    'linkId', p_link_id, 'unlinked', true
  );
  perform public.store_registration_receipt(
    'unlink_document', p_registration_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: recover_unlink_registration_stage_document (admin AAL2 path)
--
-- Uses the DISTINCT 'recover_unlink_document' operation_kind for both the replay
-- gate and the stored receipt so an admin recovery cannot replay-shadow (or be
-- shadowed by) a prior PRO 'unlink_document' receipt sharing the same
-- operation_id within the same scope.
-- ---------------------------------------------------------------------------
create function public.recover_unlink_registration_stage_document(
  p_actor_id uuid,
  p_actor_aal text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_stage_id uuid,
  p_link_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.registration_stage_documents%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_result jsonb;
begin
  perform 1 from public.profiles profile
  where profile.id = p_actor_id and profile.role in ('admin', 'super_admin')
    and profile.status = 'active' and profile.tenant_id is null
    and profile.mfa_enrolled_at is not null
  for update;
  if not found or p_actor_aal <> 'aal2' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_RECOVERY_REASON';
  end if;
  v_result := public.registration_replay_result(
    'recover_unlink_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  perform 1 from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform 1 from public.registration_stages stage
  where stage.id = p_stage_id and stage.registration_id = p_registration_id
    and stage.tenant_id = p_tenant_id and stage.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'STAGE_NOT_FOUND'; end if;
  v_result := public.registration_replay_result(
    'recover_unlink_document', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  select * into v_link from public.registration_stage_documents link
  where link.id = p_link_id and link.registration_id = p_registration_id
    and link.stage_id = p_stage_id and link.tenant_id = p_tenant_id
    and link.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DOCUMENT_LINK_NOT_FOUND'; end if;
  delete from public.registration_stage_documents where id = p_link_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_document_unlinked', 'admin',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'stage_id', p_stage_id,
      'link_id', p_link_id, 'document_id', v_link.document_id,
      'document_version_id', v_link.document_version_id,
      'recovery', true, 'reason', v_reason
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'stageId', p_stage_id,
    'linkId', p_link_id, 'unlinked', true, 'recovery', true
  );
  perform public.store_registration_receipt(
    'recover_unlink_document', p_registration_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: create_registration_visa_person
-- ---------------------------------------------------------------------------
create function public.create_registration_visa_person(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_person_kind public.registration_person_kind,
  p_shareholder_id uuid,
  p_employee_id uuid,
  p_display_name text,
  p_visa_kind public.registration_visa_kind,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.company_registrations%rowtype;
  v_stage_status public.registration_stage_status;
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_person_id uuid;
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_display_name is null or v_display_name <> p_display_name
     or v_display_name ~ '[[:space:]]{2,}'
     or v_display_name ~ '[[:cntrl:]<>]'
     or pg_catalog.char_length(v_display_name) not between 2 and 200
     or not coalesce((
       (p_person_kind = 'shareholder' and p_visa_kind = 'investor'
        and p_shareholder_id is not null and p_employee_id is null)
       or (p_person_kind = 'employee' and p_visa_kind = 'employee'
           and p_employee_id is not null and p_shareholder_id is null)
       or (p_person_kind in ('dependent', 'other') and p_visa_kind = 'family'
           and p_shareholder_id is null and p_employee_id is null)
     ), false) then
    raise exception using errcode = '22023', message = 'INVALID_VISA_PERSON';
  end if;
  v_result := public.registration_replay_result(
    'create_visa_person', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  select * into v_registration from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  select stage.status into v_stage_status from public.registration_stages stage
  where stage.registration_id = p_registration_id and stage.tenant_id = p_tenant_id
    and stage.company_id = p_company_id and stage.code = 'visa_processing'
  for update;
  if v_registration.current_stage <> 'visa_processing'
     or v_stage_status is null or v_stage_status not in ('in_progress', 'blocked') then
    raise exception using errcode = 'P0001', message = 'VISA_STAGE_INACTIVE';
  end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'create_visa_person', p_registration_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if p_shareholder_id is not null then
    perform 1 from public.company_shareholders shareholder
    where shareholder.id = p_shareholder_id and shareholder.tenant_id = p_tenant_id
      and shareholder.company_id = p_company_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'VISA_SOURCE_NOT_FOUND'; end if;
  elsif p_employee_id is not null then
    perform 1 from public.employees employee
    where employee.id = p_employee_id and employee.tenant_id = p_tenant_id
      and employee.company_id = p_company_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'VISA_SOURCE_NOT_FOUND'; end if;
  end if;
  insert into public.registration_visa_people (
    registration_id, tenant_id, company_id, shareholder_id, employee_id,
    display_name, person_kind, visa_kind
  ) values (
    p_registration_id, p_tenant_id, p_company_id, p_shareholder_id, p_employee_id,
    v_display_name, p_person_kind, p_visa_kind
  ) returning id into v_person_id;
  insert into public.registration_visa_events (
    registration_id, visa_person_id, tenant_id, company_id, from_stage, to_stage,
    from_status, to_status, operation_id, actor_id, visa_version
  ) values (
    p_registration_id, v_person_id, p_tenant_id, p_company_id, null, 'documents_ready',
    null, 'not_started', p_operation_id, p_actor_id, 1
  );
  update public.registration_visa_people set version = 1 where id = v_person_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_visa_changed', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'visa_person_id', v_person_id,
      'command', 'create', 'person_kind', p_person_kind::text, 'visa_kind', p_visa_kind::text
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || p_registration_id::text ||
      ':visa_person:' || v_person_id::text ||
      ':operation:' || p_operation_id::text || ':version:1',
    'registration.visa_changed', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_registration_id, 'company_id', p_company_id,
      'visa_person_id', v_person_id, 'stage_code', 'documents_ready',
      'status', 'not_started', 'change', 'created', 'version', 1
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'visaPersonId', v_person_id,
    'displayName', v_display_name, 'personKind', p_person_kind::text,
    'visaKind', p_visa_kind::text, 'status', 'not_started',
    'currentStage', 'documents_ready', 'visaVersion', 1
  );
  perform public.store_registration_receipt(
    'create_visa_person', p_registration_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'VISA_PERSON_EXISTS';
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: transition_registration_visa_person
-- ---------------------------------------------------------------------------
create function public.transition_registration_visa_person(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_visa_person_id uuid,
  p_command text,
  p_to_stage public.registration_visa_stage_code,
  p_expected_visa_version bigint,
  p_reason_code text,
  p_reason_text text,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.registration_visa_people%rowtype;
  v_from_status public.registration_visa_status;
  v_to_status public.registration_visa_status;
  v_from_stage public.registration_visa_stage_code;
  v_reason_code text := pg_catalog.upper(pg_catalog.btrim(p_reason_code));
  v_reason_text text := pg_catalog.btrim(p_reason_text);
  v_from_ordinal integer;
  v_to_ordinal integer;
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_command is null or p_to_stage is null
     or p_command not in ('start', 'advance', 'block', 'unblock', 'complete') then
    raise exception using errcode = '22023', message = 'INVALID_VISA_COMMAND';
  end if;
  if p_command in ('block', 'unblock') and (
    v_reason_code is null or v_reason_code not in (
      'AUTHORITY_DELAY', 'CUSTOMER_ACTION_REQUIRED', 'DOCUMENT_CORRECTION_REQUIRED',
      'AUTHORITY_RESUMED', 'CUSTOMER_ACTION_COMPLETED', 'DOCUMENT_CORRECTED'
    ) or v_reason_text is null or pg_catalog.char_length(v_reason_text) not between 3 and 500
  ) then
    raise exception using errcode = '22023', message = 'INVALID_VISA_REASON';
  elsif p_command not in ('block', 'unblock')
        and (p_reason_code is not null or p_reason_text is not null) then
    raise exception using errcode = '22023', message = 'INVALID_VISA_REASON';
  end if;
  v_result := public.registration_replay_result(
    'transition_visa_person', p_visa_person_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  perform 1 from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id and registration.status in ('in_progress', 'blocked')
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_ACTIVE'; end if;
  perform 1 from public.registration_stages stage
  where stage.registration_id = p_registration_id and stage.tenant_id = p_tenant_id
    and stage.company_id = p_company_id and stage.code = 'visa_processing'
    and stage.status in ('in_progress', 'blocked')
    and exists (
      select 1 from public.company_registrations registration
      where registration.id = p_registration_id
        and registration.current_stage = 'visa_processing'
    )
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'VISA_STAGE_INACTIVE'; end if;
  select * into v_person from public.registration_visa_people person
  where person.id = p_visa_person_id and person.registration_id = p_registration_id
    and person.tenant_id = p_tenant_id and person.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'VISA_PERSON_NOT_FOUND'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'transition_visa_person', p_visa_person_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if p_expected_visa_version is null or v_person.version <> p_expected_visa_version then
    raise exception using errcode = 'P0001', message = 'STALE_VISA_VERSION';
  end if;
  if v_person.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'VISA_PERSON_TERMINAL';
  end if;
  v_from_status := v_person.status;
  v_from_stage := v_person.current_stage;
  v_from_ordinal := pg_catalog.array_position(
    array['documents_ready','entry_permit','status_adjustment','medical_fitness','emirates_id','residency_issued'],
    v_person.current_stage::text
  );
  v_to_ordinal := pg_catalog.array_position(
    array['documents_ready','entry_permit','status_adjustment','medical_fitness','emirates_id','residency_issued'],
    p_to_stage::text
  );
  if p_command = 'start' then
    if v_person.status <> 'not_started' or p_to_stage <> v_person.current_stage then
      raise exception using errcode = 'P0001', message = 'INVALID_VISA_TRANSITION';
    end if;
    v_to_status := 'in_progress';
  elsif p_command = 'advance' then
    if v_person.status <> 'in_progress' or v_to_ordinal <> v_from_ordinal + 1 then
      raise exception using errcode = 'P0001', message = 'ILLEGAL_VISA_STAGE_ORDER';
    end if;
    v_to_status := 'in_progress';
  elsif p_command = 'block' then
    if v_person.status <> 'in_progress' or p_to_stage <> v_person.current_stage then
      raise exception using errcode = 'P0001', message = 'INVALID_VISA_TRANSITION';
    end if;
    v_to_status := 'blocked';
  elsif p_command = 'unblock' then
    if v_person.status <> 'blocked' or p_to_stage <> v_person.current_stage then
      raise exception using errcode = 'P0001', message = 'INVALID_VISA_TRANSITION';
    end if;
    v_to_status := 'in_progress';
  else
    if v_person.status <> 'in_progress' or v_person.current_stage <> 'residency_issued'
       or p_to_stage <> 'residency_issued' then
      raise exception using errcode = 'P0001', message = 'VISA_COMPLETION_BLOCKED';
    end if;
    v_to_status := 'completed';
  end if;
  update public.registration_visa_people set
    current_stage = p_to_stage, status = v_to_status, version = version + 1,
    started_at = case when started_at is null then pg_catalog.now() else started_at end,
    completed_at = case when v_to_status = 'completed' then pg_catalog.now() else null end
  where id = p_visa_person_id;
  insert into public.registration_visa_events (
    registration_id, visa_person_id, tenant_id, company_id, from_stage, to_stage,
    from_status, to_status, reason_code, reason_text, operation_id, actor_id, visa_version
  ) values (
    p_registration_id, p_visa_person_id, p_tenant_id, p_company_id,
    v_from_stage, p_to_stage, v_from_status, v_to_status,
    case when p_command in ('block', 'unblock') then v_reason_code else null end,
    case when p_command in ('block', 'unblock') then v_reason_text else null end,
    p_operation_id, p_actor_id, v_person.version + 1
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_visa_changed', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'visa_person_id', p_visa_person_id,
      'command', p_command, 'to_stage', p_to_stage::text, 'to_status', v_to_status::text,
      'reason_code', case when p_command in ('block', 'unblock') then v_reason_code else null end
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || p_registration_id::text ||
      ':visa_person:' || p_visa_person_id::text ||
      ':operation:' || p_operation_id::text ||
      ':version:' || (v_person.version + 1)::text,
    'registration.visa_changed', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_registration_id, 'company_id', p_company_id,
      'visa_person_id', p_visa_person_id, 'stage_code', p_to_stage::text,
      'status', v_to_status::text, 'change', p_command, 'version', v_person.version + 1
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'visaPersonId', p_visa_person_id,
    'status', v_to_status::text, 'currentStage', p_to_stage::text,
    'visaVersion', v_person.version + 1
  );
  perform public.store_registration_receipt(
    'transition_visa_person', p_visa_person_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Command RPC: cancel_registration_visa_person
-- ---------------------------------------------------------------------------
create function public.cancel_registration_visa_person(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid,
  p_visa_person_id uuid,
  p_expected_visa_version bigint,
  p_reason_code text,
  p_reason_text text,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.registration_visa_people%rowtype;
  v_reason_code text := pg_catalog.upper(pg_catalog.btrim(p_reason_code));
  v_reason_text text := pg_catalog.btrim(p_reason_text);
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_reason_code is null
     or v_reason_code not in ('CUSTOMER_CANCELLED', 'NOT_APPLICABLE', 'DUPLICATE_PERSON', 'OPERATOR_CANCELLED')
     or v_reason_text is null or pg_catalog.char_length(v_reason_text) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_VISA_REASON';
  end if;
  v_result := public.registration_replay_result(
    'cancel_visa_person', p_visa_person_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  perform 1 from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id and registration.status in ('in_progress', 'blocked')
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_ACTIVE'; end if;
  perform 1 from public.registration_stages stage
  where stage.registration_id = p_registration_id and stage.tenant_id = p_tenant_id
    and stage.company_id = p_company_id and stage.code = 'visa_processing'
    and stage.status in ('in_progress', 'blocked')
    and exists (
      select 1 from public.company_registrations registration
      where registration.id = p_registration_id
        and registration.current_stage = 'visa_processing'
    )
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'VISA_STAGE_INACTIVE'; end if;
  select * into v_person from public.registration_visa_people person
  where person.id = p_visa_person_id and person.registration_id = p_registration_id
    and person.tenant_id = p_tenant_id and person.company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'VISA_PERSON_NOT_FOUND'; end if;
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_result := public.registration_replay_result(
    'cancel_visa_person', p_visa_person_id, p_operation_id, p_payload_hash
  );
  if v_result is not null then return v_result; end if;
  if p_expected_visa_version is null or v_person.version <> p_expected_visa_version then
    raise exception using errcode = 'P0001', message = 'STALE_VISA_VERSION';
  end if;
  if v_person.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'VISA_PERSON_TERMINAL';
  end if;
  update public.registration_visa_people set
    status = 'cancelled', version = version + 1,
    started_at = coalesce(started_at, pg_catalog.now()), completed_at = pg_catalog.now()
  where id = p_visa_person_id;
  insert into public.registration_visa_events (
    registration_id, visa_person_id, tenant_id, company_id, from_stage, to_stage,
    from_status, to_status, reason_code, reason_text, operation_id, actor_id, visa_version
  ) values (
    p_registration_id, p_visa_person_id, p_tenant_id, p_company_id,
    v_person.current_stage, v_person.current_stage, v_person.status, 'cancelled',
    v_reason_code, v_reason_text, p_operation_id, p_actor_id, v_person.version + 1
  );
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'registration_visa_changed', 'self_serve',
    pg_catalog.jsonb_build_object(
      'registration_id', p_registration_id, 'visa_person_id', p_visa_person_id,
      'command', 'cancel', 'reason_code', v_reason_code
    )
  );
  perform private.publish_p306_event(
    'tenant:' || p_tenant_id::text || ':company:' || p_company_id::text ||
      ':resource:' || p_registration_id::text ||
      ':visa_person:' || p_visa_person_id::text ||
      ':operation:' || p_operation_id::text ||
      ':version:' || (v_person.version + 1)::text,
    'registration.visa_changed', pg_catalog.now(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id', p_registration_id, 'company_id', p_company_id,
      'visa_person_id', p_visa_person_id, 'stage_code', v_person.current_stage::text,
      'status', 'cancelled', 'change', 'cancel', 'version', v_person.version + 1
    )
  );
  v_result := pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id, 'visaPersonId', p_visa_person_id,
    'status', 'cancelled', 'currentStage', v_person.current_stage::text,
    'visaVersion', v_person.version + 1
  );
  perform public.store_registration_receipt(
    'cancel_visa_person', p_visa_person_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPC: read_pro_registration_workflow
-- ---------------------------------------------------------------------------
create function public.read_pro_registration_workflow(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_registration_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select pg_catalog.jsonb_build_object(
    'registrationId', registration.id,
    'serviceCaseId', registration.service_case_id,
    'status', registration.status::text,
    'currentStage', registration.current_stage::text,
    'registrationVersion', registration.version,
    'startedAt', registration.started_at,
    'completedAt', registration.completed_at,
    'stages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'stageId', stage.id, 'code', stage.code::text, 'ordinal', stage.ordinal,
        'status', stage.status::text, 'details', stage.details,
        'stageVersion', stage.version, 'startedAt', stage.started_at,
        'completedAt', stage.completed_at
      ) order by stage.ordinal)
      from public.registration_stages stage
      where stage.registration_id = registration.id
        and stage.tenant_id = registration.tenant_id
        and stage.company_id = registration.company_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'linkId', link.id, 'stageId', link.stage_id, 'documentId', link.document_id,
        'documentVersionId', link.document_version_id, 'role', link.role::text,
        'label', document.label, 'mimeType', document_version.mime_type,
        'reviewStatus', document_version.review_status, 'linkedAt', link.linked_at
      ) order by link.linked_at, link.id)
      from public.registration_stage_documents link
      join public.documents document on document.id = link.document_id
        and document.tenant_id = link.tenant_id and document.company_id = link.company_id
      join public.document_versions document_version
        on document_version.id = link.document_version_id
       and document_version.document_id = link.document_id
       and document_version.tenant_id = link.tenant_id
      where link.registration_id = registration.id
        and link.tenant_id = registration.tenant_id and link.company_id = registration.company_id
    ), '[]'::jsonb),
    'visaPeople', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'visaPersonId', person.id, 'displayName', person.display_name,
        'personKind', person.person_kind::text, 'visaKind', person.visa_kind::text,
        'status', person.status::text, 'currentStage', person.current_stage::text,
        'visaVersion', person.version
      ) order by person.created_at, person.id)
      from public.registration_visa_people person
      where person.registration_id = registration.id
        and person.tenant_id = registration.tenant_id and person.company_id = registration.company_id
    ), '[]'::jsonb),
    'generatedAt', pg_catalog.now()
  ) into v_result
  from public.company_registrations registration
  where registration.id = p_registration_id and registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id;
  if v_result is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPC: read_operator_registration_workflow
--
-- HARDENED: requires operator AAL2 (fail closed unless p_actor_aal = 'aal2')
-- and writes a cross-tenant operator-read audit row into tenant_audit_log
-- inside the function. Not STABLE (it performs an audit INSERT).
-- ---------------------------------------------------------------------------
create function public.read_operator_registration_workflow(
  p_actor_id uuid,
  p_actor_aal text,
  p_registration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_tenant_id uuid;
  v_company_id uuid;
begin
  perform 1 from public.profiles profile
  where profile.id = p_actor_id and profile.role in ('admin', 'super_admin')
    and profile.status = 'active' and profile.tenant_id is null
    and profile.mfa_enrolled_at is not null;
  if not found or p_actor_aal <> 'aal2' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select registration.tenant_id, registration.company_id
    into v_tenant_id, v_company_id
  from public.company_registrations registration
  where registration.id = p_registration_id;
  if not found then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;

  -- Cross-tenant operator read is a privileged action; record it against the
  -- owning tenant before returning any workflow state.
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    v_tenant_id, p_actor_id, 'updated', 'admin',
    pg_catalog.jsonb_build_object(
      'entity', 'registration_operator_read',
      'registration_id', p_registration_id, 'company_id', v_company_id
    )
  );

  select pg_catalog.jsonb_build_object(
    'registrationId', registration.id, 'tenantId', registration.tenant_id,
    'companyId', registration.company_id, 'serviceCaseId', registration.service_case_id,
    'status', registration.status::text, 'currentStage', registration.current_stage::text,
    'registrationVersion', registration.version,
    'stages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'stageId', stage.id, 'code', stage.code::text, 'ordinal', stage.ordinal,
        'status', stage.status::text, 'details', stage.details,
        'stageVersion', stage.version, 'startedAt', stage.started_at,
        'completedAt', stage.completed_at
      ) order by stage.ordinal)
      from public.registration_stages stage
      where stage.registration_id = registration.id
        and stage.tenant_id = registration.tenant_id and stage.company_id = registration.company_id
    ), '[]'::jsonb),
    'visaPeople', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'visaPersonId', person.id, 'displayName', person.display_name,
        'personKind', person.person_kind::text, 'visaKind', person.visa_kind::text,
        'status', person.status::text, 'currentStage', person.current_stage::text,
        'visaVersion', person.version
      ) order by person.created_at, person.id)
      from public.registration_visa_people person
      where person.registration_id = registration.id
        and person.tenant_id = registration.tenant_id and person.company_id = registration.company_id
    ), '[]'::jsonb),
    'generatedAt', pg_catalog.now()
  ) into v_result
  from public.company_registrations registration
  where registration.id = p_registration_id;
  if v_result is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPC: read_customer_registration_progress
-- ---------------------------------------------------------------------------
create function public.read_customer_registration_progress(
  p_actor_id uuid,
  p_registration_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_company_id uuid;
  v_status public.registration_status;
  v_current_stage public.registration_stage_code;
  v_result jsonb;
begin
  select registration.tenant_id, registration.company_id,
         registration.status, registration.current_stage
  into v_tenant_id, v_company_id, v_status, v_current_stage
  from public.company_registrations registration
  join public.profiles profile on profile.id = p_actor_id
    and profile.role = 'customer' and profile.status = 'active'
    and profile.tenant_id = registration.tenant_id
  join public.customer_profiles customer on customer.profile_id = profile.id
    and customer.linked_company_id = registration.company_id
  where registration.id = p_registration_id;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  select pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id,
    'status', v_status::text,
    'currentStage', v_current_stage::text,
    'completedStages', (
      select count(*) from public.registration_stages stage_count
      where stage_count.registration_id = p_registration_id
        and stage_count.tenant_id = v_tenant_id
        and stage_count.company_id = v_company_id
        and stage_count.status in ('completed', 'skipped')
    ),
    'totalStages', 7,
    'generatedAt', pg_catalog.now(),
    'stages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'code', stage.code::text, 'ordinal', stage.ordinal,
        'status', stage.status::text, 'startedAt', stage.started_at,
        'completedAt', stage.completed_at
      ) order by stage.ordinal)
      from public.registration_stages stage
      where stage.registration_id = p_registration_id
        and stage.tenant_id = v_tenant_id
        and stage.company_id = v_company_id
    ), '[]'::jsonb),
    'documents', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'evidenceId', link.id, 'documentId', document.id,
      'stageCode', document_stage.code::text,
      'role', link.role::text, 'label', document.label,
      'mimeType', approved_document.mime_type, 'linkedAt', link.linked_at
    ) order by link.linked_at, link.id) filter (
      where approved_document.review_status = 'approved'
    ), '[]'::jsonb),
    'visaProgress', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'displayName', visa_person.display_name,
        'personKind', visa_person.person_kind::text,
        'visaKind', visa_person.visa_kind::text,
        'status', visa_person.status::text,
        'currentStage', visa_person.current_stage::text
      ) order by visa_person.created_at, visa_person.id)
      from public.registration_visa_people visa_person
      where visa_person.tenant_id = registration.tenant_id
        and visa_person.company_id = registration.company_id
        and visa_person.registration_id = registration.id
        and (
          (visa_person.person_kind = 'shareholder' and exists (
            select 1 from public.company_shareholders visible_shareholder
            where visible_shareholder.id = visa_person.shareholder_id
              and visible_shareholder.tenant_id = registration.tenant_id
              and visible_shareholder.company_id = registration.company_id
          ))
          or (visa_person.person_kind = 'employee' and exists (
            select 1 from public.employees visible_employee
            where visible_employee.id = visa_person.employee_id
              and visible_employee.tenant_id = registration.tenant_id
              and visible_employee.company_id = registration.company_id
          ))
          or (visa_person.person_kind = 'dependent'
              and visa_person.shareholder_id is null and visa_person.employee_id is null)
          or (visa_person.person_kind = 'other'
              and visa_person.shareholder_id is null and visa_person.employee_id is null)
        )
    ), '[]'::jsonb)
  ) into v_result
  from public.company_registrations registration
  left join public.registration_stage_documents link
    on link.registration_id = registration.id
   and link.tenant_id = registration.tenant_id
   and link.company_id = registration.company_id
  left join public.documents document
    on document.id = link.document_id and document.tenant_id = link.tenant_id
   and document.company_id = link.company_id
  left join public.registration_stages document_stage
    on document_stage.id = link.stage_id
   and document_stage.registration_id = link.registration_id
   and document_stage.tenant_id = link.tenant_id
   and document_stage.company_id = link.company_id
  left join public.document_versions approved_document
    on approved_document.id = link.document_version_id
   and approved_document.document_id = link.document_id
   and approved_document.tenant_id = link.tenant_id
  where registration.id = p_registration_id
    and registration.tenant_id = v_tenant_id
    and registration.company_id = v_company_id
  group by registration.id, registration.tenant_id, registration.company_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
alter function private.p306_event_uuid(text) owner to postgres;
alter function private.publish_p306_event(text, text, timestamptz, uuid, uuid, uuid, uuid, jsonb) owner to postgres;
alter function public.reject_registration_event_mutation() owner to postgres;
alter function public.guard_registration_domain_event_consumption() owner to postgres;
alter function public.registration_replay_result(public.registration_operation_kind, uuid, uuid, text) owner to postgres;
alter function public.store_registration_receipt(public.registration_operation_kind, uuid, uuid, text, jsonb) owner to postgres;
alter function public.create_company_registration(uuid, uuid, uuid, text, text, timestamptz, uuid, text) owner to postgres;
alter function public.transition_registration_stage(uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, jsonb, text, text, uuid, text) owner to postgres;
alter function public.link_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, public.registration_document_role, uuid, text) owner to postgres;
alter function public.unlink_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) owner to postgres;
alter function public.recover_unlink_registration_stage_document(uuid, text, uuid, uuid, uuid, uuid, uuid, text, uuid, text) owner to postgres;
alter function public.create_registration_visa_person(uuid, uuid, uuid, uuid, public.registration_person_kind, uuid, uuid, text, public.registration_visa_kind, uuid, text) owner to postgres;
alter function public.transition_registration_visa_person(uuid, uuid, uuid, uuid, uuid, text, public.registration_visa_stage_code, bigint, text, text, uuid, text) owner to postgres;
alter function public.cancel_registration_visa_person(uuid, uuid, uuid, uuid, uuid, bigint, text, text, uuid, text) owner to postgres;
alter function public.read_pro_registration_workflow(uuid, uuid, uuid, uuid) owner to postgres;
alter function public.read_operator_registration_workflow(uuid, text, uuid) owner to postgres;
alter function public.read_customer_registration_progress(uuid, uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- Grants: default-deny, service_role only. No function here is a legitimate
-- authenticated self-service AAL2 caller (operators route through service_role),
-- so none are granted to authenticated.
-- ---------------------------------------------------------------------------
revoke all on function private.p306_event_uuid(text) from public, anon, authenticated, service_role;
revoke all on function private.publish_p306_event(text, text, timestamptz, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.registration_replay_result(public.registration_operation_kind, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.store_registration_receipt(public.registration_operation_kind, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_company_registration(uuid, uuid, uuid, text, text, timestamptz, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.transition_registration_stage(uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, jsonb, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.link_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, public.registration_document_role, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.unlink_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.recover_unlink_registration_stage_document(uuid, text, uuid, uuid, uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_registration_visa_person(uuid, uuid, uuid, uuid, public.registration_person_kind, uuid, uuid, text, public.registration_visa_kind, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.transition_registration_visa_person(uuid, uuid, uuid, uuid, uuid, text, public.registration_visa_stage_code, bigint, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_registration_visa_person(uuid, uuid, uuid, uuid, uuid, bigint, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.read_pro_registration_workflow(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_operator_registration_workflow(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_customer_registration_progress(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.registration_replay_result(public.registration_operation_kind, uuid, uuid, text) to service_role;
grant execute on function public.store_registration_receipt(public.registration_operation_kind, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.create_company_registration(uuid, uuid, uuid, text, text, timestamptz, uuid, text) to service_role;
grant execute on function public.transition_registration_stage(uuid, uuid, uuid, uuid, uuid, text, bigint, bigint, jsonb, text, text, uuid, text) to service_role;
grant execute on function public.link_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, public.registration_document_role, uuid, text) to service_role;
grant execute on function public.unlink_registration_stage_document(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.recover_unlink_registration_stage_document(uuid, text, uuid, uuid, uuid, uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.create_registration_visa_person(uuid, uuid, uuid, uuid, public.registration_person_kind, uuid, uuid, text, public.registration_visa_kind, uuid, text) to service_role;
grant execute on function public.transition_registration_visa_person(uuid, uuid, uuid, uuid, uuid, text, public.registration_visa_stage_code, bigint, text, text, uuid, text) to service_role;
grant execute on function public.cancel_registration_visa_person(uuid, uuid, uuid, uuid, uuid, bigint, text, text, uuid, text) to service_role;
grant execute on function public.read_pro_registration_workflow(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.read_operator_registration_workflow(uuid, text, uuid) to service_role;
grant execute on function public.read_customer_registration_progress(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Read RPC: read_admin_registration_index (contract 0105)
--
-- Bounded, display-safe cross-workspace registration oversight for platform
-- operators. HARDENED like read_operator_registration_workflow: requires an
-- active tenant-null admin/super_admin with MFA enrolled AND p_actor_aal =
-- 'aal2' (fail closed otherwise), and writes ONE cross-tenant operator-read
-- audit row into tenant_audit_log before returning any state. Not STABLE (it
-- performs an audit INSERT). Filters are allowlisted; NULL/empty means no
-- constraint. Items are safe summaries (ids/title/codes/timestamps only) with
-- an exact total count of matching rows, not just the page.
-- ---------------------------------------------------------------------------
create function public.read_admin_registration_index(
  p_actor_id uuid,
  p_actor_aal text,
  p_company text,
  p_pro text,
  p_stage text,
  p_status text,
  p_page integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page integer := p_page;
  v_page_size constant integer := 20;
  v_company text := nullif(pg_catalog.btrim(coalesce(p_company, '')), '');
  v_pro text := nullif(pg_catalog.btrim(coalesce(p_pro, '')), '');
  v_stage text := nullif(pg_catalog.btrim(coalesce(p_stage, '')), '');
  v_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  v_company_id uuid;
  v_pro_id uuid;
  v_stage_code public.registration_stage_code;
  v_status_value public.registration_stage_status;
  v_total integer;
  v_items jsonb;
  v_audit_tenant_id uuid;
begin
  perform 1 from public.profiles profile
  where profile.id = p_actor_id and profile.role in ('admin', 'super_admin')
    and profile.status = 'active' and profile.tenant_id is null
    and profile.mfa_enrolled_at is not null;
  if not found or p_actor_aal <> 'aal2' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_page is null or v_page not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_INPUT';
  end if;

  -- Allowlisted filters. p_company narrows by company id only when it parses as
  -- a uuid; company_profiles carries no slug, so any non-uuid company token is
  -- ignored rather than guessed. p_pro is the active-assignment pro id.
  if v_company is not null then
    begin
      v_company_id := v_company::uuid;
    exception when others then
      v_company_id := null;
    end;
  end if;
  if v_pro is not null then
    begin
      v_pro_id := v_pro::uuid;
    exception when others then
      v_pro_id := null;
    end;
  end if;
  if v_stage is not null then
    begin
      v_stage_code := v_stage::public.registration_stage_code;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_INPUT';
    end;
  end if;
  if v_status is not null then
    begin
      v_status_value := v_status::public.registration_stage_status;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_INPUT';
    end;
  end if;

  select pg_catalog.count(*)::integer into v_total
  from public.company_registrations registration
  join public.service_cases service_case
    on service_case.id = registration.service_case_id
   and service_case.tenant_id = registration.tenant_id
   and service_case.company_id = registration.company_id
  join public.registration_stages current_stage
    on current_stage.registration_id = registration.id
   and current_stage.tenant_id = registration.tenant_id
   and current_stage.company_id = registration.company_id
   and current_stage.code = registration.current_stage
  where (v_company_id is null or registration.company_id = v_company_id)
    and (v_stage_code is null or registration.current_stage = v_stage_code)
    and (v_status_value is null or current_stage.status = v_status_value)
    and (
      v_pro_id is null
      or exists (
        select 1 from public.pro_company_assignments assignment
        where assignment.pro_profile_id = v_pro_id
          and assignment.tenant_id = registration.tenant_id
          and assignment.company_id = registration.company_id
          and assignment.status = 'active'
      )
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'registrationId', page_row.id,
    'tenantId', page_row.tenant_id,
    'companyId', page_row.company_id,
    'companyName', page_row.company_name,
    'proName', page_row.pro_name,
    'title', page_row.title,
    'status', page_row.status,
    'currentStage', page_row.current_stage,
    'currentStageStatus', page_row.current_stage_status,
    'completedStages', page_row.completed_stages,
    'totalStages', 7,
    'registrationVersion', page_row.version,
    'updatedAt', page_row.updated_at
  ) order by page_row.created_at desc, page_row.id asc), '[]'::jsonb),
         (pg_catalog.array_agg(page_row.tenant_id order by page_row.created_at desc, page_row.id asc))[1]
    into v_items, v_audit_tenant_id
  from (
    select registration.id, registration.tenant_id, registration.company_id,
           service_case.title, registration.status::text as status,
           registration.current_stage::text as current_stage,
           current_stage.status::text as current_stage_status,
           company.company_name, active_pro.full_name as pro_name,
           (select pg_catalog.count(*)::integer from public.registration_stages stage
             where stage.registration_id = registration.id
               and stage.status in ('completed', 'skipped')) as completed_stages,
           registration.version,
           registration.updated_at, registration.created_at
    from public.company_registrations registration
    join public.company_profiles company
      on company.id = registration.company_id
     and company.tenant_id = registration.tenant_id
    left join lateral (
      select profile.full_name
      from public.pro_company_assignments assignment
      join public.profiles profile on profile.id = assignment.pro_profile_id
      where assignment.tenant_id = registration.tenant_id
        and assignment.company_id = registration.company_id
        and assignment.status = 'active'
      limit 1
    ) as active_pro on true
    join public.service_cases service_case
      on service_case.id = registration.service_case_id
     and service_case.tenant_id = registration.tenant_id
     and service_case.company_id = registration.company_id
    join public.registration_stages current_stage
      on current_stage.registration_id = registration.id
     and current_stage.tenant_id = registration.tenant_id
     and current_stage.company_id = registration.company_id
     and current_stage.code = registration.current_stage
    where (v_company_id is null or registration.company_id = v_company_id)
      and (v_stage_code is null or registration.current_stage = v_stage_code)
      and (v_status_value is null or current_stage.status = v_status_value)
      and (
        v_pro_id is null
        or exists (
          select 1 from public.pro_company_assignments assignment
          where assignment.pro_profile_id = v_pro_id
            and assignment.tenant_id = registration.tenant_id
            and assignment.company_id = registration.company_id
            and assignment.status = 'active'
        )
      )
    order by registration.created_at desc, registration.id asc
    limit v_page_size offset (v_page - 1) * v_page_size
  ) as page_row;

  -- Cross-tenant operator index read is a privileged action; record ONE audit
  -- row before returning. tenant_audit_log.tenant_id is NOT NULL with an FK to
  -- tenants, and the scan spans workspaces, so attribute the row to the tenant
  -- of the most-recent matching registration (the same ordering as page 1).
  -- When zero rows match, nothing is disclosed and no row is written, mirroring
  -- read_operator_registration_workflow's fail-closed no-disclosure shape.
  if v_audit_tenant_id is not null then
    insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
    values (
      v_audit_tenant_id, p_actor_id, 'updated', 'admin',
      pg_catalog.jsonb_build_object(
        'entity', 'registration_admin_index',
        'company', v_company_id, 'pro', v_pro_id,
        'stage', v_stage_code::text, 'status', v_status_value::text,
        'page', v_page, 'total', v_total
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPC: resolve_company_active_registration
--
-- Resolves the single active company_registrations id for a company, for
-- PRO/customer/employee pages that hold a company but not a registration id.
-- Scope resolves from live DB state per role (assignment / customer link /
-- employee link), never from JWT claims. Message shape matches the existing
-- RPCs: unauthorized raises 42501 FORBIDDEN, missing raises P0001
-- REGISTRATION_NOT_FOUND (no existence disclosure difference beyond role scope).
-- ---------------------------------------------------------------------------
create function public.resolve_company_active_registration(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_role text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_registration_id uuid;
begin
  if p_role = 'pro' then
    if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  elsif p_role = 'customer' then
    perform 1
    from public.profiles profile
    join public.customer_profiles customer on customer.profile_id = profile.id
    where profile.id = p_actor_id and profile.role = 'customer'
      and profile.status = 'active' and profile.tenant_id = p_tenant_id
      and customer.linked_company_id = p_company_id;
    if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  elsif p_role = 'employee' then
    perform 1 from public.employees employee
    where employee.profile_id = p_actor_id
      and employee.tenant_id = p_tenant_id
      and employee.company_id = p_company_id
      and employee.status = 'active';
    if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  else
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select registration.id into v_registration_id
  from public.company_registrations registration
  where registration.tenant_id = p_tenant_id
    and registration.company_id = p_company_id
    and registration.status in ('draft', 'in_progress', 'blocked');
  if v_registration_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  return v_registration_id;
end;
$$;

alter function public.read_admin_registration_index(uuid, text, text, text, text, text, integer) owner to postgres;
alter function public.resolve_company_active_registration(uuid, uuid, uuid, text) owner to postgres;

revoke all on function public.read_admin_registration_index(uuid, text, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_company_active_registration(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.read_admin_registration_index(uuid, text, text, text, text, text, integer) to service_role;
grant execute on function public.resolve_company_active_registration(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Read RPC: read_employee_visa_person
--
-- Employee-scoped visa read keyed by the actor's OWN employee id. Replaces the
-- prior ordinal `${registrationId}:visa:0` heuristic in the employee path, which
-- keyed to person[0] and would surface the wrong person once a registration has
-- more than one visa person.
--
-- Authorize: the actor must be an ACTIVE employees row (profile_id = actor,
-- status active) whose (tenant_id, company_id) match the registration's; else
-- 42501 FORBIDDEN, mirroring resolve_company_active_registration's employee
-- branch. Then find the single registration_visa_people row for that
-- registration where employee_id = the actor's own employee id; if none, raise
-- P0001 REGISTRATION_NOT_FOUND (no disclosure difference).
--
-- Returns jsonb for EXACTLY that one person in the same per-person shape
-- read_customer_registration_progress uses (safe reference-only fields only),
-- wrapped in a single-element visaPeople array so the adapter builds a
-- RegistrationPresentation with the employee's own person. The stable
-- visaPersonId / key is the registration_visa_people row id. No other people and
-- no protected identifiers of others are ever surfaced.
-- ---------------------------------------------------------------------------
create function public.read_employee_visa_person(
  p_actor_id uuid,
  p_registration_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_company_id uuid;
  v_employee_id uuid;
  v_person jsonb;
begin
  -- Resolve the registration scope and authorize the actor as an active
  -- employee of the owning (tenant, company). Scope comes from live DB state,
  -- never from JWT claims.
  select registration.tenant_id, registration.company_id, employee.id
    into v_tenant_id, v_company_id, v_employee_id
  from public.company_registrations registration
  join public.employees employee
    on employee.profile_id = p_actor_id
   and employee.tenant_id = registration.tenant_id
   and employee.company_id = registration.company_id
   and employee.status = 'active'
  where registration.id = p_registration_id;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;

  -- The single own visa person row, keyed by the actor's own employee id (a
  -- partial unique index guarantees at most one). Reference-only safe fields;
  -- the visaPersonId is the stable row id used as the presentation key.
  select pg_catalog.jsonb_build_object(
    'visaPersonId', visa_person.id,
    'displayName', visa_person.display_name,
    'personKind', visa_person.person_kind::text,
    'visaKind', visa_person.visa_kind::text,
    'status', visa_person.status::text,
    'currentStage', visa_person.current_stage::text
  ) into v_person
  from public.registration_visa_people visa_person
  where visa_person.registration_id = p_registration_id
    and visa_person.tenant_id = v_tenant_id
    and visa_person.company_id = v_company_id
    and visa_person.employee_id = v_employee_id;
  if v_person is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'registrationId', p_registration_id,
    'generatedAt', pg_catalog.now(),
    'visaPerson', v_person
  );
end;
$$;

alter function public.read_employee_visa_person(uuid, uuid) owner to postgres;
revoke all on function public.read_employee_visa_person(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_employee_visa_person(uuid, uuid) to service_role;

commit;
