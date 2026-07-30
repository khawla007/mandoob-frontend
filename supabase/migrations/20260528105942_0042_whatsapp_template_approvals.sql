-- Step 19b — WhatsApp template approval tracking.

create table if not exists public.whatsapp_template_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  template_id text not null,
  meta_template_name text not null,
  language text not null default 'en',
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  status text not null check (status in ('pending', 'approved', 'rejected', 'disabled')),
  notes text,
  rejection_reason text,
  submitted_at timestamptz,
  last_checked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, template_id, language)
);

create unique index if not exists whatsapp_template_approvals_global_uniq
  on public.whatsapp_template_approvals(template_id, language)
  where tenant_id is null;

create index if not exists whatsapp_template_approvals_tenant_idx
  on public.whatsapp_template_approvals(tenant_id, template_id, language);

drop trigger if exists whatsapp_template_approvals_set_updated_at
  on public.whatsapp_template_approvals;
create trigger whatsapp_template_approvals_set_updated_at
  before update on public.whatsapp_template_approvals
  for each row execute function public.set_updated_at();

alter table public.whatsapp_template_approvals enable row level security;

drop policy if exists whatsapp_template_approvals_platform_read
  on public.whatsapp_template_approvals;
create policy whatsapp_template_approvals_platform_read
  on public.whatsapp_template_approvals for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists whatsapp_template_approvals_platform_insert
  on public.whatsapp_template_approvals;
create policy whatsapp_template_approvals_platform_insert
  on public.whatsapp_template_approvals for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists whatsapp_template_approvals_platform_update
  on public.whatsapp_template_approvals;
create policy whatsapp_template_approvals_platform_update
  on public.whatsapp_template_approvals for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists whatsapp_template_approvals_platform_delete
  on public.whatsapp_template_approvals;
create policy whatsapp_template_approvals_platform_delete
  on public.whatsapp_template_approvals for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

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
    'erasure_completed',
    'bulk_imported',
    'meeting_slot_created',
    'meeting_scheduled',
    'meeting_cancelled',
    'meeting_completed',
    'meeting_recording_attached',
    'whatsapp_template_status_updated'
  ));
