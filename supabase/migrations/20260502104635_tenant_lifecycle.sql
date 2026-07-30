-- 0016_tenant_lifecycle.sql
-- Step 8.1 — PRO firm onboarding lifecycle.
--
-- Adds:
--   * partial index on tenants(status) for the pending-approvals queue lookup
--   * tenant_audit_log for create/approve/reject/suspend/reactivate events
--   * auth_event_kind values for tenant lifecycle events
--
-- Service-role only access (no RLS policies). Super_admin queries via
-- service-role client; non-super_admin roles never read this table.

-- Pending-tenants approval queue uses a partial index for cheap lookups
-- regardless of total tenant count.
create index if not exists tenants_status_pending_idx
  on public.tenants(created_at desc)
  where status = 'pending';

-- ============================================================
-- tenant_audit_log
-- ============================================================
create table if not exists public.tenant_audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (
    action in ('created', 'approved', 'rejected', 'suspended', 'reactivated')
  ),
  source text not null check (source in ('admin', 'self_serve', 'system')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenant_audit_log_tenant_id_idx
  on public.tenant_audit_log(tenant_id, created_at desc);

alter table public.tenant_audit_log enable row level security;
-- No policies = service-role only. Matches tenant_smtp_config / tenant_*_config pattern.

-- ============================================================
-- auth_event_kind extensions
-- ============================================================
alter type public.auth_event_kind add value if not exists 'tenant_provisioned';
alter type public.auth_event_kind add value if not exists 'tenant_self_serve_submitted';
alter type public.auth_event_kind add value if not exists 'tenant_approved';
alter type public.auth_event_kind add value if not exists 'tenant_rejected';
alter type public.auth_event_kind add value if not exists 'tenant_suspended';
alter type public.auth_event_kind add value if not exists 'tenant_reactivated';
