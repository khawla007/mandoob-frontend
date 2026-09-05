'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { createInvoice } from '@/lib/data/invoices';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { createRefund } from '@/lib/payments/providers/tap';
import {
  executeIdempotentRefund,
  type RefundIntent,
  type RefundWorkflowInput,
} from '@/lib/payments/refund-workflow';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  createInvoiceActionSchema,
  manualPaymentActionSchema,
  refundInvoiceActionSchema,
  voidInvoiceActionSchema,
} from '@/lib/validation/invoice';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type CallerCtx = {
  callerId: string;
  tenantId: string;
  tenantSlug: string;
  ip: string;
};

async function resolveAssignedCompanyForCaller(ctx: CallerCtx) {
  const company = await readAssignedCompanyForPro(ctx.callerId, ctx.tenantSlug);
  if (!company || company.tenantId !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  return company;
}

async function resolveProCaller(slug: string): Promise<CallerCtx> {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
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
    const company = await resolveAssignedCompanyForCaller(ctx);

    const result = await createInvoice({
      tenantId: ctx.tenantId,
      companyId: company.id,
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
    revalidatePath(`/t/${ctx.tenantSlug}/payments/${result.data.id}`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/analytics`);
    revalidatePath(`/t/${ctx.tenantSlug}/company`);
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
    const company = await resolveAssignedCompanyForCaller(ctx);
    const admin = createSupabaseServiceRoleClient();
    const { data: paymentId, error } = await admin.rpc(
      'mark_company_invoice_paid' as never,
      {
        p_tenant_id: ctx.tenantId,
        p_company_id: company.id,
        p_invoice_id: parsed.invoiceId,
        p_actor_id: ctx.callerId,
        p_method: parsed.method,
        p_note: parsed.note ?? null,
        p_ip: ctx.ip,
      } as never,
    );
    if (error || typeof paymentId !== 'string') {
      return { ok: false, error: 'Could not record manual payment', code: 'PAYMENT_FAILED' };
    }

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/${parsed.invoiceId}`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/analytics`);
    revalidatePath(`/t/${ctx.tenantSlug}/company`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
    return { ok: true, data: { paymentId } };
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
    const company = await resolveAssignedCompanyForCaller(ctx);
    const admin = createSupabaseServiceRoleClient();
    const { data: invoiceId, error } = await admin.rpc(
      'void_company_invoice' as never,
      {
        p_tenant_id: ctx.tenantId,
        p_company_id: company.id,
        p_invoice_id: parsed.invoiceId,
        p_actor_id: ctx.callerId,
        p_reason: parsed.reason,
        p_ip: ctx.ip,
      } as never,
    );
    if (error || typeof invoiceId !== 'string') {
      return { ok: false, error: 'Could not void invoice', code: 'VOID_FAILED' };
    }

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/${parsed.invoiceId}`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/analytics`);
    revalidatePath(`/t/${ctx.tenantSlug}/company`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
    return { ok: true, data: { invoiceId } };
  } catch (err) {
    return mapError(err);
  }
}

export async function issueRefundAction(args: {
  tenantSlug: string;
  invoiceId: string;
  amountMinor: number;
  reason: string;
  operationId: string;
}): Promise<
  ActionResult<{
    refundId: string;
    partial: boolean;
    status: 'pending' | 'succeeded' | 'failed';
  }>
> {
  try {
    const parsed = refundInvoiceActionSchema.parse({
      invoiceId: args.invoiceId,
      amountMinor: args.amountMinor,
      reason: args.reason,
      operationId: args.operationId,
    });
    const ctx = await resolveProCaller(args.tenantSlug);
    const company = await resolveAssignedCompanyForCaller(ctx);
    const admin = createSupabaseServiceRoleClient();
    const input: RefundWorkflowInput = {
      tenantId: ctx.tenantId,
      companyId: company.id,
      invoiceId: parsed.invoiceId,
      actorId: ctx.callerId,
      amountMinor: parsed.amountMinor,
      reason: parsed.reason,
      ip: ctx.ip,
      idempotencyKey: parsed.operationId,
    };
    const result = await executeIdempotentRefund(input, {
      prepare: async (workflowInput) => prepareRefundIntent(admin, workflowInput),
      callProvider: async (intent, workflowInput) => callRefundProvider(intent, workflowInput),
      reconcile: async (reconcileInput) => reconcileRefundIntent(admin, reconcileInput),
    });
    if (!result.ok) {
      return {
        ok: false,
        error: 'Refund could not be completed',
        code: result.retryable ? 'TAP_ERROR' : 'TAP_TERMINAL',
      };
    }

    revalidatePath(`/t/${ctx.tenantSlug}/payments`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/${parsed.invoiceId}`);
    revalidatePath(`/t/${ctx.tenantSlug}/payments/analytics`);
    revalidatePath(`/t/${ctx.tenantSlug}/company`);
    revalidatePath(`/t/${ctx.tenantSlug}/dashboard`);
    return {
      ok: true,
      data: { refundId: result.refundId, partial: result.partial, status: result.status },
    };
  } catch (err) {
    return mapError(err);
  }
}

async function prepareRefundIntent(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: RefundWorkflowInput,
): Promise<RefundIntent> {
  const { data, error } = await admin.rpc(
    'prepare_company_refund' as never,
    {
      p_tenant_id: input.tenantId,
      p_company_id: input.companyId,
      p_invoice_id: input.invoiceId,
      p_actor_id: input.actorId,
      p_amount_minor: input.amountMinor,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    } as never,
  );
  if (error) throw new ApiError('REFUND_PREPARE_FAILED', error.message, 409);
  const row = ((data as unknown as Record<string, unknown>[] | null) ?? [])[0];
  if (!row) throw new ApiError('REFUND_PREPARE_FAILED', 'Refund intent missing', 500);
  return {
    refundId: row.refund_id as string,
    paymentId: row.payment_id as string,
    provider: row.provider as string,
    providerChargeId: (row.provider_charge_id as string | null) ?? null,
    providerIdempotencyKey: row.provider_idempotency_key as string,
    status: row.refund_status as RefundIntent['status'],
    currency: row.currency as string,
  };
}

async function callRefundProvider(intent: RefundIntent, input: RefundWorkflowInput) {
  if (intent.provider === 'manual') {
    return { ok: true as const, providerRefundId: null, status: 'succeeded' as const };
  }
  if (intent.provider !== 'tap' || !intent.providerChargeId) {
    return { ok: false as const, error: 'Payment provider reference missing', retryable: false };
  }
  const config = await resolveTenantTapConfig(input.tenantId);
  if (!config) return { ok: false as const, error: 'Tap not configured', retryable: false };
  const result = await createRefund({
    config,
    chargeId: intent.providerChargeId,
    amountMinor: input.amountMinor,
    currency: intent.currency,
    reason: input.reason,
    idempotencyKey: intent.providerIdempotencyKey,
  });
  return result.ok
    ? {
        ok: true as const,
        providerRefundId: result.refundId,
        status: result.status === 'PENDING' ? ('pending' as const) : ('succeeded' as const),
      }
    : { ok: false as const, error: result.error, retryable: result.retryable };
}

async function reconcileRefundIntent(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  args: {
    intent: RefundIntent;
    input: RefundWorkflowInput;
    providerRefundId: string | null;
    status: 'pending' | 'succeeded' | 'failed';
  },
) {
  const { data, error } = await admin.rpc(
    'reconcile_company_refund' as never,
    {
      p_tenant_id: args.input.tenantId,
      p_company_id: args.input.companyId,
      p_refund_id: args.intent.refundId,
      p_actor_id: args.input.actorId,
      p_provider_refund_id: args.providerRefundId,
      p_status: args.status,
      p_ip: args.input.ip,
    } as never,
  );
  if (error) throw new ApiError('REFUND_RECONCILE_FAILED', error.message, 500);
  const row = ((data as unknown as Record<string, unknown>[] | null) ?? [])[0];
  if (!row) throw new ApiError('REFUND_RECONCILE_FAILED', 'Refund result missing', 500);
  return {
    refundId: row.refund_id as string,
    partial: row.partial as boolean,
    status: row.refund_status as 'pending' | 'succeeded' | 'failed',
  };
}

function mapError(err: unknown): { ok: false; error: string; code: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: 'Operation could not be completed', code: err.code };
  }
  return { ok: false, error: 'Operation could not be completed', code: 'UNKNOWN' };
}
