-- Step 21a — Tap payment reconciliation cron.
-- Adds stuck-payment terminal states, Tap raw payload storage, and the
-- audit action used by the sweeper.

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in (
    'initiated',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded',
    'abandoned',
    'voided'
  ));

alter table public.payments
  add column if not exists provider_event_payload jsonb;

create index if not exists payments_tap_initiated_reconcile_idx
  on public.payments (created_at asc)
  where provider = 'tap'
    and status = 'initiated'
    and provider_charge_id is not null;

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
    'reconciled'
  ));
