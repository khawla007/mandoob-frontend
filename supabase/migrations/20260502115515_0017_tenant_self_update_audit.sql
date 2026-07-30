-- Allow PRO admins to log self-serve updates to their own tenant.
-- Source: docs/step-9-pro-dashboard-shell-plan.md (sub-step 9.4 + 9.2 createClient).

alter type public.auth_event_kind add value if not exists 'tenant_self_updated';

-- Extend tenant_audit_log.action CHECK to include 'updated'.
alter table public.tenant_audit_log
  drop constraint if exists tenant_audit_log_action_check;

alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in ('created','approved','rejected','suspended','reactivated','updated'));
