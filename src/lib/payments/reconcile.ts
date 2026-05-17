import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

export type PaymentStatus =
  | 'initiated'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'abandoned'
  | 'voided';

type MapTapChargeArgs = {
  currentStatus: string;
  tapStatus: string;
  paymentCreatedAt: string;
  now?: Date;
  abandonedAfterMinutes?: number;
};

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
  'abandoned',
  'voided',
]);

const ACTIVE_TAP_STATUSES = new Set(['INITIATED', 'IN_PROGRESS', 'AUTHORIZED']);

export function mapTapChargeToPaymentStatus(args: MapTapChargeArgs): PaymentStatus | string {
  if (TERMINAL_STATUSES.has(args.currentStatus)) return args.currentStatus;

  const tapStatus = args.tapStatus.toUpperCase();
  switch (tapStatus) {
    case 'CAPTURED':
      return 'succeeded';
    case 'FAILED':
    case 'DECLINED':
      return 'failed';
    case 'VOID':
      return 'voided';
    default:
      break;
  }

  if (!ACTIVE_TAP_STATUSES.has(tapStatus)) return args.currentStatus;

  const now = args.now ?? new Date();
  const cutoffMs = (args.abandonedAfterMinutes ?? 60) * 60 * 1000;
  const ageMs = now.getTime() - new Date(args.paymentCreatedAt).getTime();
  return ageMs >= cutoffMs ? 'abandoned' : 'initiated';
}

type ReconcilePaymentRow = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  status: string;
  provider_charge_id: string | null;
  created_at: string;
};

export type ReconcileChargeArgs = {
  supabase: Supa;
  payment: ReconcilePaymentRow;
  tapStatus: string;
  rawPayload: unknown;
  now?: Date;
};

export type ReconcileOutcome = 'noop' | 'unchanged' | 'updated';

export async function applyTapChargeReconciliation(
  args: ReconcileChargeArgs,
): Promise<ReconcileOutcome> {
  const targetStatus = mapTapChargeToPaymentStatus({
    currentStatus: args.payment.status,
    tapStatus: args.tapStatus,
    paymentCreatedAt: args.payment.created_at,
    now: args.now,
  });

  if (targetStatus === args.payment.status) {
    if (TERMINAL_STATUSES.has(args.payment.status)) return 'noop';
    await args.supabase
      .from('payments')
      .update({ provider_event_payload: args.rawPayload })
      .eq('id', args.payment.id);
    return 'unchanged';
  }

  const nowIso = (args.now ?? new Date()).toISOString();
  const paymentUpdate: Record<string, unknown> = {
    status: targetStatus,
    provider_event_payload: args.rawPayload,
  };
  if (targetStatus !== 'initiated') paymentUpdate.received_at = nowIso;
  if (targetStatus === 'failed') paymentUpdate.failure_reason = args.tapStatus.toLowerCase();

  await args.supabase.from('payments').update(paymentUpdate).eq('id', args.payment.id);

  if (targetStatus === 'succeeded') {
    await args.supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: nowIso })
      .eq('id', args.payment.invoice_id);
  }

  await args.supabase.from('tenant_audit_log').insert({
    tenant_id: args.payment.tenant_id,
    actor_id: null,
    action: 'reconciled',
    source: 'system',
    details: {
      entity: 'payment',
      payment_id: args.payment.id,
      invoice_id: args.payment.invoice_id,
      provider: 'tap',
      provider_charge_id: args.payment.provider_charge_id,
      from_status: args.payment.status,
      to_status: targetStatus,
      tap_status: args.tapStatus,
    },
  });

  return 'updated';
}

export function extractTapChargeStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const status = (payload as { status?: unknown }).status;
  return typeof status === 'string' && status.trim() ? status.toUpperCase() : null;
}
