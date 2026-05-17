'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { createInvoice } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { createRefund } from '@/lib/payments/providers/tap';
import { resolveRefundLedgerState } from '@/lib/payments/refund-state';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  createInvoiceActionSchema,
  manualPaymentActionSchema,
  refundInvoiceActionSchema,
  voidInvoiceActionSchema,
} from '@/lib/validation/invoice';

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

export async function createInvoiceAction(
  tenantSlug: string,
  raw: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const ctx = await resolveProCaller(tenantSlug);
    const input = createInvoiceActionSchema.parse(raw);
    const admin = createSupabaseServiceRoleClient();
    const { data: client } = await admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', input.clientId)
      .maybeSingle();

    if (!client || client.tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'Client not found', code: 'NOT_FOUND' };
    }

    const result = await createInvoice({
      tenantId: ctx.tenantId,
      clientId: input.clientId,
      label: input.label,
      amountMinor: input.amountMinor,
      currency: input.currency,
      dueAt: input.dueAt,
      createdBy: ctx.callerId,
    });

    if (!result.ok) {
      return { ok: false, error: result.error, code: result.code };
    }

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/clients/${input.clientId}`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
    return { ok: true, data: { invoiceId: result.data.id } };
  } catch (err) {
    return mapError(err);
  }
}

export async function markInvoicePaidAction(args: {
  tenantSlug: string;
  invoiceId: string;
  method: 'cash' | 'bank_transfer';
  note?: string;
}): Promise<ActionResult<{ paymentId: string }>> {
  try {
    const parsed = manualPaymentActionSchema.parse({
      invoiceId: args.invoiceId,
      method: args.method,
      note: args.note,
    });
    const ctx = await resolveProCaller(args.tenantSlug);
    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status, amount_minor, currency')
      .eq('id', parsed.invoiceId)
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
        method: parsed.method,
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
        method: parsed.method,
        note: parsed.note ?? null,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
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
    const parsed = voidInvoiceActionSchema.parse({
      invoiceId: args.invoiceId,
      reason: args.reason,
    });
    const ctx = await resolveProCaller(args.tenantSlug);
    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status')
      .eq('id', parsed.invoiceId)
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
      .update({ status: 'void', void_reason: parsed.reason })
      .eq('id', invoice.id);

    await admin.from('tenant_audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.callerId,
      action: 'invoice_voided',
      source: 'admin',
      details: {
        entity: 'invoice',
        invoice_id: invoice.id,
        reason: parsed.reason,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
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
    const parsed = refundInvoiceActionSchema.parse({
      invoiceId: args.invoiceId,
      amountMinor: args.amountMinor,
      reason: args.reason,
    });
    const ctx = await resolveProCaller(args.tenantSlug);

    const admin = createSupabaseServiceRoleClient();

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, tenant_id, status, amount_minor, currency')
      .eq('id', parsed.invoiceId)
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
    if (parsed.amountMinor > invoice.amount_minor) {
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
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return { ok: false, error: 'No succeeded payment to refund', code: 'INVALID_STATE' };
    }

    const { data: existingRefunds } = await admin
      .from('refunds')
      .select('amount_minor, status')
      .eq('payment_id', payment.id)
      .neq('status', 'failed');
    const alreadyRefundedMinor = (existingRefunds ?? []).reduce(
      (sum, row) => sum + (row.amount_minor as number),
      0,
    );
    const remainingMinor = invoice.amount_minor - alreadyRefundedMinor;
    if (parsed.amountMinor > remainingMinor) {
      return {
        ok: false,
        error: 'Refund exceeds remaining refundable amount',
        code: 'INVALID_AMOUNT',
      };
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
        amountMinor: parsed.amountMinor,
        currency: invoice.currency,
        reason: parsed.reason,
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
        amount_minor: parsed.amountMinor,
        reason: parsed.reason,
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

    const ledgerState = resolveRefundLedgerState({
      refundStatus,
      amountMinor: parsed.amountMinor,
      remainingMinor,
    });
    if (ledgerState.settlesImmediately && ledgerState.invoiceStatus && ledgerState.paymentStatus) {
      await admin.from('invoices').update({ status: ledgerState.invoiceStatus }).eq('id', invoice.id);
      await admin.from('payments').update({ status: ledgerState.paymentStatus }).eq('id', payment.id);
    }

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
        amount_minor: parsed.amountMinor,
        currency: invoice.currency,
        provider: payment.provider,
        partial: !ledgerState.isFull,
        pending: !ledgerState.settlesImmediately,
        reason: parsed.reason,
        ip: ctx.ip,
      },
    });

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
    return { ok: true, data: { refundId: refundRow.id, partial: !ledgerState.isFull } };
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
