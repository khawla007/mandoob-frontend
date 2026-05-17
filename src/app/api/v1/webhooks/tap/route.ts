import { NextResponse } from 'next/server';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { type TapHashstringFields, verifyTapHashstring } from '@/lib/payments/signature';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

type TapWebhookPayload = {
  id?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  reference?: { gateway?: string | null; payment?: string | null } | null;
  transaction?: { created?: string | number | null } | null;
  metadata?: Record<string, string> | null;
};

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  let payload: TapWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as TapWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const tenantId = payload.metadata?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: 'metadata.tenant_id missing', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const config = await resolveTenantTapConfig(tenantId);
  if (!config) {
    return NextResponse.json(
      { error: 'tap not configured for tenant', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const fields = extractHashstringFields(payload);
  if (!fields) {
    return NextResponse.json(
      { error: 'missing fields for signature', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const headerHash = req.headers.get('hashstring') ?? '';
  if (!verifyTapHashstring(fields, headerHash, config.webhookSecret)) {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 403 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const status = (payload.status ?? '').toUpperCase();
  const chargeId = payload.id ?? null;
  if (!chargeId) {
    return NextResponse.json({ error: 'charge id missing', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const outcome = await applyChargeStatus(supabase, {
    tenantId,
    chargeId,
    status,
    failureReason: extractFailureReason(payload),
  });

  return NextResponse.json({ ok: true, outcome });
}

type ChargeStatusInput = {
  tenantId: string;
  chargeId: string;
  status: string;
  failureReason: string | null;
};

async function applyChargeStatus(
  supabase: Supa,
  input: ChargeStatusInput,
): Promise<'noop' | 'updated'> {
  const { data: paymentRow } = await supabase
    .from('payments')
    .select('id, status, invoice_id, amount_minor, tenant_id')
    .eq('provider_charge_id', input.chargeId)
    .maybeSingle();

  if (!paymentRow) return 'noop';
  if (paymentRow.tenant_id !== input.tenantId) return 'noop';

  const targetPaymentStatus = mapTapStatusToPayment(input.status);
  const targetInvoiceStatus = mapTapStatusToInvoice(input.status);
  if (!targetPaymentStatus) return 'noop';
  if (paymentRow.status === targetPaymentStatus) return 'noop';

  const nowIso = new Date().toISOString();
  await supabase
    .from('payments')
    .update({
      status: targetPaymentStatus,
      received_at: nowIso,
      failure_reason: input.failureReason,
    })
    .eq('id', paymentRow.id);

  if (targetInvoiceStatus) {
    const update: Record<string, unknown> = { status: targetInvoiceStatus };
    if (targetInvoiceStatus === 'paid') update.paid_at = nowIso;
    await supabase.from('invoices').update(update).eq('id', paymentRow.invoice_id);
  }

  const auditAction =
    targetPaymentStatus === 'succeeded'
      ? 'payment_succeeded'
      : targetPaymentStatus === 'failed'
        ? 'payment_failed'
        : null;

  if (auditAction) {
    await supabase.from('tenant_audit_log').insert({
      tenant_id: input.tenantId,
      actor_id: null,
      action: auditAction,
      source: 'system',
      details: {
        entity: 'payment',
        payment_id: paymentRow.id,
        invoice_id: paymentRow.invoice_id,
        provider: 'tap',
        provider_charge_id: input.chargeId,
        status: input.status,
      },
    });
  }

  return 'updated';
}

function mapTapStatusToPayment(
  status: string,
): 'succeeded' | 'failed' | 'refunded' | 'partially_refunded' | null {
  switch (status) {
    case 'CAPTURED':
    case 'AUTHORIZED':
      return 'succeeded';
    case 'FAILED':
    case 'DECLINED':
    case 'CANCELLED':
    case 'TIMEDOUT':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded';
    default:
      return null;
  }
}

function mapTapStatusToInvoice(status: string): 'paid' | 'refunded' | 'partially_refunded' | null {
  switch (status) {
    case 'CAPTURED':
    case 'AUTHORIZED':
      return 'paid';
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded';
    default:
      return null;
  }
}

function extractFailureReason(payload: TapWebhookPayload): string | null {
  const status = (payload.status ?? '').toUpperCase();
  if (!['FAILED', 'DECLINED', 'CANCELLED', 'TIMEDOUT'].includes(status)) return null;
  return status.toLowerCase();
}

export function extractHashstringFields(payload: TapWebhookPayload): TapHashstringFields | null {
  const id = payload.id;
  const amountRaw = payload.amount;
  const currency = payload.currency;
  const status = payload.status;
  const created = payload.transaction?.created;
  if (
    !id ||
    amountRaw === undefined ||
    amountRaw === null ||
    !currency ||
    !status ||
    created == null
  ) {
    return null;
  }
  return {
    id,
    amount: typeof amountRaw === 'number' ? amountRaw.toFixed(3) : String(amountRaw),
    currency,
    gatewayReference: payload.reference?.gateway ?? '',
    paymentReference: payload.reference?.payment ?? '',
    status,
    created: String(created),
  };
}
