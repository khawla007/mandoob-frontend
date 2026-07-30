-- Step 26 — Lead Kanban.

alter table public.leads
  drop constraint if exists leads_stage_check;

update public.leads
set stage = 'won'
where stage = 'converted';

alter table public.leads
  add constraint leads_stage_check
  check (stage in ('new', 'contacted', 'qualified', 'won', 'lost'));

alter table public.leads
  drop constraint if exists leads_routing_reason_check;

alter table public.leads
  add constraint leads_routing_reason_check
  check (routing_reason in (
    'assigned_active_tenant_v1',
    'platform_unassigned',
    'assigned_by_platform'
  ));

create index if not exists leads_stage_created_idx
  on public.leads(stage, created_at desc);

create index if not exists leads_assigned_member_stage_idx
  on public.leads(assigned_team_member_id, stage, created_at desc)
  where assigned_team_member_id is not null;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added'
  )),
  from_value text,
  to_value text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_events_lead_created_idx
  on public.lead_events(lead_id, created_at desc);

create index if not exists lead_events_tenant_created_idx
  on public.lead_events(tenant_id, created_at desc);

alter table public.lead_events enable row level security;

drop policy if exists lead_events_platform_read_all on public.lead_events;
create policy lead_events_platform_read_all on public.lead_events for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists lead_events_pro_tenant_read on public.lead_events;
create policy lead_events_pro_tenant_read on public.lead_events for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
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
    'lead_note_added'
  ));
