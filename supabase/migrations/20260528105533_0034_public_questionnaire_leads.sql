-- Step 25 — Public questionnaire lead capture.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  name text not null,
  email text,
  phone text,
  source text not null default 'questionnaire'
    check (source in ('questionnaire')),
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  form_data jsonb not null default '{}'::jsonb,
  estimate_data jsonb not null default '{}'::jsonb,
  routing_reason text not null
    check (routing_reason in ('assigned_active_tenant_v1', 'platform_unassigned')),
  score integer not null default 0 check (score >= 0 and score <= 100),
  assigned_team_member_id uuid references public.profiles(id) on delete set null,
  converted_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_tenant_stage_created_idx
  on public.leads(tenant_id, stage, created_at desc);

create index if not exists leads_source_created_idx
  on public.leads(source, created_at desc);

do $$
begin
  if to_regclass('public.outbound_emails') is not null then
    create unique index if not exists outbound_emails_linked_scheduled_uniq
      on public.outbound_emails(linked_entity_type, linked_entity_id, scheduled_for)
      where linked_entity_type is not null and linked_entity_id is not null;
  end if;
end $$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

drop policy if exists leads_platform_read_all on public.leads;
create policy leads_platform_read_all on public.leads for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

drop policy if exists leads_pro_tenant_read on public.leads;
create policy leads_pro_tenant_read on public.leads for select
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
    'lead_created'
  ));
