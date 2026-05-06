'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { createRefund } from '@/lib/payments/providers/tap';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type CallerCtx = {
  callerId: string;
  tenantId: string;
  tenantSlug: string;
  ip: string;
};

async function resolveProCaller(slug: string): Promise<CallerCtx> {
  const session = await requireRole('pro', 'admin');
  if (!session.tenantId) {
    throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
  }
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);
  const hdr = await headers();
  return {
    callerId: session.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ip: hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
  };
}

export async function markInvoicePaidAction(args: {
  tenantSlug: string;
  invoiceId: string;
  method: 'cash' | 'bank_transfer';
  note?: string;
}): Promise<ActionResult<{ paymentId: string }>> {
  try {
    const ctx = await resolveProCaller(args.tenantSlug);
    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status, amount_minor, currency')
      .eq('id', args.invoiceId)
      .maybeSingle();

    if (!invoice || invoice.tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'Invoice not found', code: 'NOT_FOUND' };
    }
    if (invoice.status !== 'open' && invoice.status !== 'draft') {
      return {
        ok: false,
        error: `Cannot mark invoice in state '${invoice.status}' as paid`,
        code: 'INVALID_STATE',
      };
    }

    const nowIso = new Date().toISOString();
    const { data: paymentRow, error: paymentErr } = await admin
      .from('payments')
      .insert({
        tenant_id: ctx.tenantId,
        invoice_id: invoice.id,
        provider: 'manual',
        amount_minor: invoice.amount_minor,
        currency: invoice.currency,
        method: args.method,
        status: 'succeeded',
        received_at: nowIso,
      })
      .select('id')
      .single();

    if (paymentErr || !paymentRow) {
      return {
        ok: false,
        error: paymentErr?.message ?? 'Could not record manual payment',
        code: 'DB_INSERT_FAILED',
      };
    }

    await admin.from('invoices').update({ status: 'paid', paid_at: nowIso }).eq('id', invoice.id);

    await admin.from('tenant_audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.callerId,
      action: 'invoice_marked_paid',
      source: 'admin',
      details: {
        entity: 'invoice',
        invoice_id: invoice.id,
        payment_id: paymentRow.id,
        method: args.method,
        note: args.note ?? null,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    return { ok: true, data: { paymentId: paymentRow.id } };
  } catch (err) {
    return mapError(err);
  }
}

export async function voidInvoiceAction(args: {
  tenantSlug: string;
  invoiceId: string;
  reason: string;
}): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const ctx = await resolveProCaller(args.tenantSlug);
    if (!args.reason || args.reason.trim().length < 3) {
      return { ok: false, error: 'Reason is required', code: 'VALIDATION_FAILED' };
    }
    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status')
      .eq('id', args.invoiceId)
      .maybeSingle();

    if (!invoice || invoice.tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'Invoice not found', code: 'NOT_FOUND' };
    }
    if (invoice.status !== 'open' && invoice.status !== 'draft') {
      return {
        ok: false,
        error: `Cannot void invoice in state '${invoice.status}'`,
        code: 'INVALID_STATE',
      };
    }

    await admin
      .from('invoices')
      .update({ status: 'void', void_reason: args.reason })
      .eq('id', invoice.id);

    await admin.from('tenant_audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.callerId,
      action: 'invoice_voided',
      source: 'admin',
      details: {
        entity: 'invoice',
        invoice_id: invoice.id,
        reason: args.reason,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    return { ok: true, data: { invoiceId: invoice.id } };
  } catch (err) {
    return mapError(err);
  }
}

export async function issueRefundAction(args: {
  tenantSlug: string;
  invoiceId: string;
  amountMinor: number;
  reason: string;
}): Promise<ActionResult<{ refundId: string; partial: boolean }>> {
  try {
    const ctx = await resolveProCaller(args.tenantSlug);
    if (args.amountMinor <= 0) {
      return { ok: false, error: 'Amount must be positive', code: 'VALIDATION_FAILED' };
    }
    if (!args.reason || args.reason.trim().length < 3) {
      return { ok: false, error: 'Reason is required', code: 'VALIDATION_FAILED' };
    }

    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status, amount_minor, currency')
      .eq('id', args.invoiceId)
      .maybeSingle();

    if (!invoice || invoice.tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'Invoice not found', code: 'NOT_FOUND' };
    }
    if (invoice.status !== 'paid' && invoice.status !== 'partially_refunded') {
      return {
        ok: false,
        error: `Cannot refund invoice in state '${invoice.status}'`,
        code: 'INVALID_STATE',
      };
    }
    if (args.amountMinor > invoice.amount_minor) {
      return {
        ok: false,
        error: 'Refund exceeds invoice amount',
        code: 'INVALID_AMOUNT',
      };
    }

    const { data: payment } = await admin
      .from('payments')
      .select('id, provider, provider_charge_id, amount_minor')
      .eq('invoice_id', invoice.id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return { ok: false, error: 'No succeeded payment to refund', code: 'INVALID_STATE' };
    }

    let providerRefundId: string | null = null;
    let refundStatus: 'pending' | 'succeeded' | 'failed' = 'succeeded';

    if (payment.provider === 'tap') {
      if (!payment.provider_charge_id) {
        return { ok: false, error: 'Payment missing Tap charge id', code: 'INVALID_STATE' };
      }
      const config = await resolveTenantTapConfig(ctx.tenantId);
      if (!config) {
        return { ok: false, error: 'Tap not configured', code: 'NOT_CONFIGURED' };
      }
      const refundResult = await createRefund({
        config,
        chargeId: payment.provider_charge_id,
        amountMinor: args.amountMinor,
        currency: invoice.currency,
        reason: args.reason,
      });
      if (!refundResult.ok) {
        return { ok: false, error: refundResult.error, code: 'TAP_ERROR' };
      }
      providerRefundId = refundResult.refundId;
      refundStatus = refundResult.status === 'PENDING' ? 'pending' : 'succeeded';
    }

    const { data: refundRow, error: refundErr } = await admin
      .from('refunds')
      .insert({
        tenant_id: ctx.tenantId,
        payment_id: payment.id,
        provider_refund_id: providerRefundId,
        amount_minor: args.amountMinor,
        reason: args.reason,
        status: refundStatus,
      })
      .select('id')
      .single();

    if (refundErr || !refundRow) {
      return {
        ok: false,
        error: refundErr?.message ?? 'Could not record refund',
        code: 'DB_INSERT_FAILED',
      };
    }

    const isFull = args.amountMinor >= invoice.amount_minor;
    const newInvoiceStatus = isFull ? 'refunded' : 'partially_refunded';
    const newPaymentStatus = isFull ? 'refunded' : 'partially_refunded';

    await admin.from('invoices').update({ status: newInvoiceStatus }).eq('id', invoice.id);
    await admin.from('payments').update({ status: newPaymentStatus }).eq('id', payment.id);

    await admin.from('tenant_audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.callerId,
      action: 'refund_issued',
      source: 'admin',
      details: {
        entity: 'refund',
        refund_id: refundRow.id,
        payment_id: payment.id,
        invoice_id: invoice.id,
        amount_minor: args.amountMinor,
        currency: invoice.currency,
        provider: payment.provider,
        partial: !isFull,
        reason: args.reason,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    return { ok: true, data: { refundId: refundRow.id, partial: !isFull } };
  } catch (err) {
    return mapError(err);
  }
}

function mapError(err: unknown): { ok: false; error: string; code: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message, code: err.code };
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { ok: false, error: message, code: 'UNKNOWN' };
}
