-- Step 17a — PDPL right-to-erasure workflow.

create type public.erasure_subject_kind as enum ('customer', 'employee');
create type public.erasure_request_status as enum (
  'pending_verification',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'completed',
  'cancelled'
);

create table if not exists public.erasure_requests (
  id uuid primary key default gen_random_uuid(),
  subject_kind public.erasure_subject_kind not null,
  subject_user_id uuid not null references public.profiles(id) on delete restrict,
  subject_tenant_id uuid not null references public.tenants(id) on delete cascade,
  reason text,
  recovery_email text not null,
  verification_token_hash text,
  verification_sent_at timestamptz,
  status public.erasure_request_status not null default 'pending_verification',
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  rejection_reason text,
  anonymization_diff jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erasure_requests_reason_len check (reason is null or char_length(reason) <= 1000),
  constraint erasure_requests_recovery_email_len check (char_length(recovery_email) <= 320),
  constraint erasure_requests_rejection_reason_len check (
    rejection_reason is null or char_length(rejection_reason) <= 1000
  )
);

create unique index if not exists erasure_requests_one_active_subject_idx
  on public.erasure_requests(subject_user_id)
  where status in ('pending_verification', 'submitted', 'under_review', 'approved');

create index if not exists erasure_requests_status_submitted_idx
  on public.erasure_requests(status, submitted_at asc);

create index if not exists erasure_requests_tenant_idx
  on public.erasure_requests(subject_tenant_id, submitted_at desc);

drop trigger if exists erasure_requests_set_updated_at on public.erasure_requests;
create trigger erasure_requests_set_updated_at before update on public.erasure_requests
  for each row execute function public.set_updated_at();

alter table public.erasure_requests enable row level security;

drop policy if exists erasure_requests_subject_read on public.erasure_requests;
create policy erasure_requests_subject_read on public.erasure_requests for select
  using (subject_user_id = auth.uid());

drop policy if exists erasure_requests_subject_insert on public.erasure_requests;
create policy erasure_requests_subject_insert on public.erasure_requests for insert
  with check (
    subject_user_id = auth.uid()
    and subject_tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('customer', 'employee')
  );

drop policy if exists erasure_requests_platform_read on public.erasure_requests;
create policy erasure_requests_platform_read on public.erasure_requests for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists erasure_requests_platform_update on public.erasure_requests;
create policy erasure_requests_platform_update on public.erasure_requests for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists erasure_requests_pro_tenant_read on public.erasure_requests;
create policy erasure_requests_pro_tenant_read on public.erasure_requests for select
  using (
    subject_tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'pro'
  );

alter table public.tenant_audit_log
  drop constraint if exists tenant_audit_log_action_check;

alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in (
    'created',
    'approved',
    'rejected',
    'suspended',
    'reactivated',
    'updated',
    'completed',
    'cancelled',
    'unlocked',
    'session_revoked',
    'invoice_created',
    'invoice_voided',
    'invoice_marked_paid',
    'payment_initiated',
    'payment_succeeded',
    'payment_failed',
    'refund_issued',
    'infected_blocked',
    'reconciled',
    'comms_skipped_opted_out',
    'lead_created',
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added',
    'erasure_requested',
    'erasure_verified',
    'erasure_approved',
    'erasure_rejected',
    'erasure_completed'
  ));
