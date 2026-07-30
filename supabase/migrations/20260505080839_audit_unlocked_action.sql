-- Step 17 — Super Admin Observability Suite
-- Extend tenant_audit_log_action_check to allow operator actions logged by the
-- new /admin/sessions and /admin/security viewers.

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
    'session_revoked'
  ));
