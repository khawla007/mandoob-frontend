'use server';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  allocateManualPayment,
  allocateReviewedBankPayment,
  attachPendingInvoiceRefund,
  createInvoiceDraft,
  finalizeInvoice,
  getInvoiceRefundResult,
  prepareInvoiceRefund,
  reconcileClaimedInvoiceRefund,
  reconcileInvoiceRefund,
  voidInvoice,
  financePhaseOperationId,
  financePayloadHash,
  type RefundReceipt,
} from '@/lib/finance/repository';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import { openBankEvidence, reviewBankEvidence } from '@/lib/finance/bank-evidence-review';
import {
  createRefund,
  getRefund,
  lookupRefundByEffectKey,
  mapTapRefundStatus,
} from '@/lib/payments/providers/tap';
import { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } from '@/lib/rate-limit';
import { runTapRefund, type DurableTapIntent } from '@/lib/payments/tap-coordinator';
import { runRateLimitedFinancialEffect } from '@/lib/payments/effect-rate-limit';
import { reconcileTerminalTapRefundFailure } from '@/lib/payments/refund-effect-failure';
import {
  runCreateInvoiceAction,
  runFinalizeInvoiceAction,
  runManualPaymentAction,
  runVoidInvoiceAction,
  type ProFinanceActionDependencies,
} from './action-logic';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

async function authorize(tenantSlug: string) {
  const { session, tenant } = await requireProTenantRouteAccess(tenantSlug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenant.slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  return {
    tenantId: tenant.id,
    companyId: company.id,
    actorId: session.id,
    tenantSlug: tenant.slug,
  };
}

function dependencies(): ProFinanceActionDependencies {
  const client = createSupabaseServiceRoleClient();
  return {
    authorize,
    createDraft: (input) => createInvoiceDraft(client, input),
    finalize: (input) => finalizeInvoice(client, input),
    allocate: (input) => allocateManualPayment(client, input),
    voidInvoice: (input) => voidInvoice(client, input),
    revalidate: revalidatePath,
  };
}

function present<T>(result: { ok: true; data: T } | { ok: false; code: string }): ActionResult<T> {
  return result.ok ? result : { ...result, error: 'Operation could not be completed' };
}

export async function createInvoiceAction(tenantSlug: string, raw: unknown) {
  return present(await runCreateInvoiceAction(tenantSlug, raw, dependencies()));
}

export async function finalizeInvoiceAction(args: {
  tenantSlug: string;
  invoiceId: string;
  expectedVersion: number;
  operationId: string;
}) {
  return present(await runFinalizeInvoiceAction(args, dependencies()));
}

export async function markInvoicePaidAction(args: {
  tenantSlug: string;
  invoiceId: string;
  expectedVersion: number;
  operationId: string;
  amountMinor: number;
  method: 'cash' | 'bank_transfer';
  evidenceSubmissionId?: string;
  note?: string;
}) {
  if (args.method === 'bank_transfer') {
    try {
      const parsed = z
        .object({
          tenantSlug: z.string().min(1),
          invoiceId: z.string().uuid(),
          expectedVersion: z.number().int().nonnegative(),
          operationId: z.string().uuid(),
          amountMinor: z.number().int().positive().max(100_000_000_000),
          evidenceSubmissionId: z.string().uuid(),
          note: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(args);
      const authority = await authorize(parsed.tenantSlug);
      const result = await allocateReviewedBankPayment(createSupabaseServiceRoleClient(), {
        tenantId: authority.tenantId,
        companyId: authority.companyId,
        actorId: authority.actorId,
        invoiceId: parsed.invoiceId,
        expectedVersion: parsed.expectedVersion,
        operationId: parsed.operationId,
        evidenceSubmissionId: parsed.evidenceSubmissionId,
        amountMinor: parsed.amountMinor,
        note: parsed.note,
      });
      if (result.ok) revalidateFinancePaths(authority.tenantSlug, parsed.invoiceId);
      return present(result);
    } catch {
      return {
        ok: false as const,
        code: 'VALIDATION_FAILED',
        error: 'Operation could not be completed',
      };
    }
  }
  return present(await runManualPaymentAction(args, dependencies()));
}

export async function reviewBankEvidenceAction(
  raw: unknown,
): Promise<ActionResult<{ state: string; version: number }>> {
  try {
    const parsed = z
      .object({
        tenantSlug: z.string().min(1),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        submissionId: z.string().uuid(),
        operationId: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
        expectedState: z.literal('pending'),
        decision: z.enum(['clean', 'rejected']),
        note: z.string().trim().min(3).max(280).nullable(),
      })
      .strict()
      .parse(raw);
    const authority = await authorize(parsed.tenantSlug);
    if (parsed.tenantId !== authority.tenantId || parsed.companyId !== authority.companyId)
      return { ok: false, code: 'FORBIDDEN', error: 'Operation could not be completed' };
    const result = await reviewBankEvidence({
      actorId: authority.actorId,
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      submissionId: parsed.submissionId,
      operationId: parsed.operationId,
      expectedVersion: parsed.expectedVersion,
      expectedState: parsed.expectedState,
      decision: parsed.decision,
      note: parsed.note,
    });
    if (result.ok) revalidateFinancePaths(authority.tenantSlug, 'bank-evidence');
    return result.ok
      ? { ok: true, data: { state: result.state, version: result.version } }
      : { ok: false, code: result.code, error: 'Operation could not be completed' };
  } catch {
    return { ok: false, code: 'VALIDATION_FAILED', error: 'Operation could not be completed' };
  }
}

export async function openBankEvidenceAction(
  raw: unknown,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const parsed = z
      .object({
        tenantSlug: z.string().min(1),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        submissionId: z.string().uuid(),
        lifetimeSeconds: z.number().int().min(1).max(300),
      })
      .strict()
      .parse(raw);
    const authority = await authorize(parsed.tenantSlug);
    if (parsed.tenantId !== authority.tenantId || parsed.companyId !== authority.companyId)
      return { ok: false, code: 'FORBIDDEN', error: 'Operation could not be completed' };
    return {
      ok: true,
      data: await openBankEvidence({
        actorId: authority.actorId,
        tenantId: authority.tenantId,
        companyId: authority.companyId,
        submissionId: parsed.submissionId,
        lifetimeSeconds: parsed.lifetimeSeconds,
      }),
    };
  } catch {
    return { ok: false, code: 'UNAVAILABLE', error: 'Operation could not be completed' };
  }
}

export async function voidInvoiceAction(args: {
  tenantSlug: string;
  invoiceId: string;
  expectedVersion: number;
  operationId: string;
  reason: string;
}) {
  return present(await runVoidInvoiceAction(args, dependencies()));
}

export async function issueRefundAction(args: {
  tenantSlug: string;
  invoiceId: string;
  paymentId: string;
  expectedVersion: number;
  amountMinor: number;
  reason: string;
  operationId: string;
}): Promise<
  ActionResult<{
    refundId: string;
    partial: boolean;
    status: 'pending' | 'succeeded' | 'failed';
    version: number;
  }>
> {
  try {
    const authority = await authorize(args.tenantSlug);
    const parsed = z
      .object({
        invoiceId: z.string().uuid(),
        paymentId: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
        amountMinor: z.number().int().positive().max(100_000_000_000),
        reason: z.string().trim().min(3).max(500),
        operationId: z.string().uuid(),
      })
      .strict()
      .parse({
        invoiceId: args.invoiceId,
        paymentId: args.paymentId,
        expectedVersion: args.expectedVersion,
        amountMinor: args.amountMinor,
        reason: args.reason,
        operationId: args.operationId,
      });
    const client = createSupabaseServiceRoleClient();
    const input = {
      tenantId: authority.tenantId,
      companyId: authority.companyId,
      actorId: authority.actorId,
      ...parsed,
    };
    const gatedPreparation = await runRateLimitedFinancialEffect(
      () =>
        consumeSensitiveRateLimit({
          key: `pro-refund:${authority.actorId}`,
          routeLabel: 'pro-refund-initiation',
          correlationId: parsed.operationId,
          ...SENSITIVE_RATE_LIMITS.financialEffect,
        }),
      () => prepareInvoiceRefund(client, input),
    );
    if (!gatedPreparation.allowed)
      return { ok: false, code: 'RATE_LIMITED', error: 'Operation could not be completed' };
    const prepared = gatedPreparation.value;
    if (!prepared.ok) return present(prepared);
    if (prepared.data.provider === 'tap') {
      const refundWorkerId = randomUUID();
      const attempt = await client
        .from('payment_provider_attempts')
        .select('destination_id')
        .eq('tenant_id', input.tenantId)
        .eq('company_id', input.companyId)
        .eq('payment_id', input.paymentId)
        .eq('provider_reference', prepared.data.providerChargeId)
        .maybeSingle();
      if (!attempt.data?.destination_id)
        return present({ ok: false as const, code: 'UNAVAILABLE' });
      const destination = await client
        .from('tap_provider_destinations')
        .select('account_id')
        .eq('id', attempt.data.destination_id)
        .eq('tenant_id', input.tenantId)
        .eq('company_id', input.companyId)
        .eq('enabled', true)
        .maybeSingle();
      const tapConfig = await resolveTenantTapConfig(input.tenantId);
      if (
        !tapConfig?.enabled ||
        tapConfig.source !== 'tenant' ||
        !tapConfig.merchantId ||
        destination.data?.account_id !== tapConfig.merchantId
      )
        return present({ ok: false as const, code: 'UNAVAILABLE' });
      const effectHash = financePayloadHash({
        refundId: prepared.data.refundId,
        chargeId: prepared.data.providerChargeId,
        amountMinor: input.amountMinor,
        currency: prepared.data.currency,
      });
      let receipt: RefundReceipt | null = null;
      let leaseToken = '';
      const result = await runTapRefund(
        { operationId: input.operationId, payloadHash: effectHash },
        {
          reserve: async () => {
            const reserved = await client.rpc(
              'p309_reserve_refund_effect' as never,
              {
                p_refund_id: prepared.data.refundId,
                p_provider_effect_key: prepared.data.providerIdempotencyKey,
                p_provider_effect_hash: effectHash,
                p_worker_id: refundWorkerId,
              } as never,
            );
            if (reserved.error || !reserved.data)
              throw reserved.error ?? new Error('reservation failed');
            const value = reserved.data as Record<string, unknown>;
            leaseToken = typeof value.leaseToken === 'string' ? value.leaseToken : '';
            return {
              operationId: input.operationId,
              effectKey: String(value.effectKey),
              payloadHash: String(value.effectHash),
              state:
                value.state === 'succeeded' || value.state === 'failed'
                  ? 'reconciled'
                  : (value.state as DurableTapIntent['state']),
              providerReference:
                typeof value.providerReference === 'string' ? value.providerReference : null,
              redirectUrl: null,
              ownsEffect: value.ownsEffect === true,
              effectToken: leaseToken || null,
              amountMinor: input.amountMinor,
              currency: prepared.data.currency,
            };
          },
          lookupEffect: async (effectKey) => {
            const recovered = await lookupRefundByEffectKey(effectKey, tapConfig);
            if (!recovered.ok) {
              if (recovered.error === 'provider effect not found') return null;
              throw new Error('provider lookup unavailable');
            }
            if (recovered.merchantId !== tapConfig.merchantId)
              throw new Error('provider destination mismatch');
            return {
              providerReference: recovered.refundId,
              redirectUrl: null,
              status: mapTapRefundStatus(recovered.status),
            };
          },
          createEffect: async (intent) => {
            const created = await createRefund({
              config: tapConfig,
              chargeId: prepared.data.providerChargeId!,
              amountMinor: intent.amountMinor,
              currency: intent.currency,
              reason: input.reason,
              idempotencyKey: intent.effectKey,
            });
            if (!created.ok)
              return created.retryable
                ? { kind: 'unknown' as const }
                : { kind: 'failed' as const, retryable: false };
            if (created.merchantId !== tapConfig.merchantId)
              return { kind: 'failed' as const, retryable: false };
            return {
              kind: 'created' as const,
              providerReference: created.refundId,
              redirectUrl: null,
              status: mapTapRefundStatus(created.status),
            };
          },
          recordFailure: async () => {
            if (!leaseToken) throw new Error('refund fence missing');
            await reconcileTerminalTapRefundFailure(false, async (failure) => {
              const failed = await reconcileClaimedInvoiceRefund(client, {
                refundId: prepared.data.refundId,
                ...failure,
                workerId: refundWorkerId,
                leaseToken,
              });
              if (!failed.ok) throw new Error(failed.code);
              receipt = failed.data;
            });
          },
          persistEffect: async (intent, effect) => {
            if (!leaseToken) throw new Error('refund lease missing');
            const fenced = await client.rpc(
              'p309_attach_refund_effect_recovery' as never,
              {
                p_refund_id: prepared.data.refundId,
                p_provider_effect_key: intent.effectKey,
                p_provider_refund_id: effect.providerReference,
                p_worker_id: refundWorkerId,
                p_lease_token: leaseToken,
              } as never,
            );
            if (fenced.error) throw fenced.error;
            const attached = await attachPendingInvoiceRefund(client, {
              ...input,
              refundId: prepared.data.refundId,
              expectedVersion: prepared.data.version,
              operationId: financePhaseOperationId(input.operationId, 'attach'),
              providerRefundId: effect.providerReference,
            });
            if (!attached.ok) throw new Error(attached.code);
            receipt = attached.data;
            return { ...intent, state: 'attached', providerReference: effect.providerReference };
          },
          reconcile: async (intent, status = 'pending') => {
            if (!intent.providerReference || !leaseToken) throw new Error('refund fence missing');
            if (status === 'pending') {
              const provider = await getRefund(intent.providerReference, tapConfig);
              if (!provider.ok || provider.merchantId !== tapConfig.merchantId)
                throw new Error('refund lookup unavailable');
              status = mapTapRefundStatus(provider.status);
              if (status === 'pending') {
                if (!receipt) {
                  const attached = await attachPendingInvoiceRefund(client, {
                    ...input,
                    refundId: prepared.data.refundId,
                    expectedVersion: prepared.data.version,
                    operationId: financePhaseOperationId(input.operationId, 'attach'),
                    providerRefundId: intent.providerReference,
                  });
                  if (!attached.ok) throw new Error(attached.code);
                  receipt = attached.data;
                }
                return intent;
              }
            }
            const reconciled = await reconcileClaimedInvoiceRefund(client, {
              refundId: prepared.data.refundId,
              providerRefundId: intent.providerReference,
              status,
              workerId: refundWorkerId,
              leaseToken,
            });
            if (!reconciled.ok) throw new Error(reconciled.code);
            receipt = reconciled.data;
            return { ...intent, state: 'reconciled' };
          },
        },
      );
      if (!result.ok) return present({ ok: false as const, code: 'UNAVAILABLE' });
      const durable = await getInvoiceRefundResult(client, prepared.data.refundId);
      if (!durable.ok) return present(durable);
      revalidateFinancePaths(authority.tenantSlug, args.invoiceId);
      return { ok: true, data: durable.data };
    }
    const reconciled = await reconcileInvoiceRefund(client, {
      ...input,
      refundId: prepared.data.refundId,
      expectedVersion: prepared.data.version,
      operationId: financePhaseOperationId(input.operationId, 'reconcile'),
      providerRefundId: null,
      status: prepared.data.provider === 'manual' ? 'succeeded' : 'failed',
    });
    if (!reconciled.ok) return present(reconciled);
    revalidateFinancePaths(authority.tenantSlug, args.invoiceId);
    return {
      ok: true,
      data: {
        refundId: reconciled.data.refundId,
        partial: reconciled.data.partial,
        status: reconciled.data.status,
        version: reconciled.data.version,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        error: 'Operation could not be completed',
      };
    return { ok: false, code: 'UNAVAILABLE', error: 'Operation could not be completed' };
  }
}

function revalidateFinancePaths(slug: string, invoiceId: string) {
  for (const path of [
    `/t/${slug}/payments`,
    `/t/${slug}/payments/${invoiceId}`,
    `/t/${slug}/payments/analytics`,
    `/t/${slug}/company`,
    `/t/${slug}/dashboard`,
    `/t/${slug}/finance`,
    `/t/${slug}/portal/payments`,
    `/t/${slug}/portal/payments/${invoiceId}`,
  ])
    revalidatePath(path);
}
