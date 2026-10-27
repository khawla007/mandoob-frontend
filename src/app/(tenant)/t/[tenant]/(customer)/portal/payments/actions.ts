'use server';

import 'server-only';
import { sanitizeFinanceError } from '@/lib/finance/contracts';
import { financePayloadHash, loadCustomerInvoiceForPayment } from '@/lib/finance/repository';
import { requireAuthorizedCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { resolveTenantTapConfig } from '@/lib/payments/config';
import {
  createCharge,
  getCharge,
  isAllowedTapRedirectUrl,
  lookupChargeByEffectKey,
} from '@/lib/payments/providers/tap';
import {
  createRedirectState,
  runTapCharge,
  type DurableTapIntent,
} from '@/lib/payments/tap-coordinator';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } from '@/lib/rate-limit';
import { runRateLimitedFinancialEffect } from '@/lib/payments/effect-rate-limit';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export async function payInvoiceAction(args: {
  tenantSlug: string;
  invoiceId: string;
  expectedVersion: number;
  operationId: string;
}): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const access = await requireAuthorizedCustomerLinkedCompanyRead(args.tenantSlug);
    const gatedInvoice = await runRateLimitedFinancialEffect(
      () =>
        consumeSensitiveRateLimit({
          key: `customer-payment:${access.session.id}`,
          routeLabel: 'customer-payment-initiation',
          correlationId: args.operationId,
          ...SENSITIVE_RATE_LIMITS.financialEffect,
        }),
      () =>
        loadCustomerInvoiceForPayment({
          tenantId: access.tenant.id,
          companyId: access.company.id,
          customerProfileId: access.session.id,
          invoiceId: args.invoiceId,
        }),
    );
    if (!gatedInvoice.allowed)
      return { ok: false, error: 'Payment is unavailable', code: 'RATE_LIMITED' };
    const invoice = gatedInvoice.value;
    if (!invoice.ok) {
      const safe = sanitizeFinanceError({ code: invoice.code });
      return {
        ok: false,
        error: 'Payment is unavailable',
        code: safe.ok ? 'UNAVAILABLE' : safe.code,
      };
    }
    if (
      !invoice.data ||
      invoice.data.status !== 'open' ||
      invoice.data.version !== args.expectedVersion
    ) {
      return { ok: false, error: 'This invoice is not payable', code: 'STALE_VERSION' };
    }
    const client = createSupabaseServiceRoleClient();
    const { data: destination } = await client
      .from('tap_provider_destinations')
      .select('id, account_id')
      .eq('tenant_id', access.tenant.id)
      .eq('company_id', access.company.id)
      .eq('enabled', true)
      .maybeSingle();
    const config = await resolveTenantTapConfig(access.tenant.id);
    if (!destination || !config?.enabled || destination.account_id !== config.merchantId)
      return { ok: false, error: 'Online payment is unavailable', code: 'PROVIDER_DISABLED' };
    const row = invoice.data as Record<string, unknown>;
    const amountMinor = Number(row.amount_minor);
    const currency = String(row.currency ?? '');
    const payloadHash = financePayloadHash({
      invoiceId: args.invoiceId,
      expectedVersion: args.expectedVersion,
      amountMinor,
      currency,
    });
    const parseIntent = (value: unknown): DurableTapIntent => {
      const data = value as Record<string, unknown>;
      return {
        operationId: args.operationId,
        effectKey: String(data.effectKey),
        payloadHash: String(data.payloadHash),
        state:
          data.state === 'succeeded' ? 'reconciled' : (data.state as DurableTapIntent['state']),
        providerReference:
          typeof data.providerReference === 'string' ? data.providerReference : null,
        redirectUrl: typeof data.redirectUrl === 'string' ? data.redirectUrl : null,
        ownsEffect: data.ownsEffect !== false,
        effectToken: typeof data.effectToken === 'string' ? data.effectToken : null,
        amountMinor: Number(data.amountMinor),
        currency: String(data.currency ?? ''),
      };
    };
    let attemptId = '';
    let reservedAmountMinor = 0;
    let reservedCurrency = '';
    const result = await runTapCharge(
      { operationId: args.operationId, payloadHash },
      {
        reserve: async () => {
          const response = await client.rpc(
            'p309_reserve_payment_attempt' as never,
            {
              p_tenant_id: access.tenant.id,
              p_company_id: access.company.id,
              p_customer_profile_id: access.session.id,
              p_invoice_id: args.invoiceId,
              p_operation_id: args.operationId,
              p_expected_invoice_version: args.expectedVersion,
              p_payload_hash: payloadHash,
              p_destination_id: destination.id,
            } as never,
          );
          if (response.error || !response.data)
            throw response.error ?? new Error('reservation failed');
          attemptId = String((response.data as Record<string, unknown>).attemptId);
          const intent = parseIntent(response.data);
          reservedAmountMinor = intent.amountMinor;
          reservedCurrency = intent.currency;
          return intent;
        },
        createEffect: async (intent) => {
          const origin = process.env.NEXT_PUBLIC_APP_URL;
          if (!origin) return { kind: 'failed', retryable: false };
          const state = createRedirectState(
            {
              operationId: args.operationId,
              invoiceId: args.invoiceId,
              expiresAt: Date.now() + 15 * 60_000,
            },
            config.webhookSecret,
          );
          const charge = await createCharge({
            config,
            amountMinor: intent.amountMinor,
            currency: intent.currency,
            description: `Invoice ${args.invoiceId}`,
            customer: {},
            redirectUrl: `${origin}/t/${access.tenant.slug}/portal/payments/${args.invoiceId}?state=${encodeURIComponent(state)}&operation=${encodeURIComponent(args.operationId)}`,
            postUrl: `${origin}/api/v1/webhooks/tap?destination=${encodeURIComponent(destination.id)}`,
            idempotencyKey: intent.effectKey,
            metadata: { account_id: destination.account_id },
          });
          if (!charge.ok)
            return { kind: charge.retryable ? 'unknown' : 'failed', retryable: charge.retryable };
          if (
            charge.merchantId !== destination.account_id ||
            charge.amountMinor !== intent.amountMinor ||
            charge.currency !== intent.currency
          )
            return { kind: 'failed', retryable: false };
          return {
            kind: 'created',
            providerReference: charge.chargeId,
            redirectUrl: charge.transactionUrl,
          };
        },
        lookupEffect: async (effectKey) => {
          const charge = await lookupChargeByEffectKey(effectKey, config);
          if (!charge.ok) {
            if (charge.error === 'provider effect not found') return null;
            throw new Error('provider lookup unavailable');
          }
          if (
            charge.merchantId !== destination.account_id ||
            charge.amountMinor !== reservedAmountMinor ||
            charge.currency !== reservedCurrency
          )
            throw new Error('provider destination mismatch');
          return { providerReference: charge.chargeId, redirectUrl: charge.transactionUrl };
        },
        recordFailure: async () => {
          const response = await client.rpc(
            'p309_fail_payment_attempt' as never,
            {
              p_attempt_id: attemptId,
              p_failure_code: 'provider_rejected',
            } as never,
          );
          if (response.error) throw response.error;
        },
        persistEffect: async (intent, effect) => {
          const response = await client.rpc(
            'p309_attach_payment_attempt' as never,
            {
              p_attempt_id: attemptId,
              p_effect_key: intent.effectKey,
              p_effect_token: intent.effectToken,
              p_provider_reference: effect.providerReference,
              p_redirect_url: effect.redirectUrl,
            } as never,
          );
          if (response.error || !response.data) throw response.error ?? new Error('attach failed');
          return parseIntent(response.data);
        },
        reconcile: async (intent) => {
          if (!intent.providerReference) throw new Error('provider reference missing');
          const charge = await getCharge(intent.providerReference, config);
          if (!charge.ok || charge.merchantId !== destination.account_id)
            throw new Error('provider lookup failed');
          const response = await client.rpc(
            'p309_reconcile_payment_attempt' as never,
            {
              p_attempt_id: attemptId,
              p_provider_reference: charge.chargeId,
              p_amount_minor: charge.amountMinor,
              p_currency: charge.currency,
              p_provider_status: charge.status,
              p_worker_id: null,
              p_lease_token: intent.effectToken,
            } as never,
          );
          if (response.error) throw response.error;
          return { ...intent, state: charge.status === 'CAPTURED' ? 'reconciled' : 'attached' };
        },
      },
    );
    if (!result.ok || !result.redirectUrl || !isAllowedTapRedirectUrl(result.redirectUrl))
      return {
        ok: false,
        error: 'Payment is unavailable',
        code: result.ok ? 'UNAVAILABLE' : result.code,
      };
    return { ok: true, data: { redirectUrl: result.redirectUrl } };
  } catch (error) {
    const safe = sanitizeFinanceError(error);
    return {
      ok: false,
      error: 'Payment is unavailable',
      code: safe.ok ? 'UNAVAILABLE' : safe.code,
    };
  }
}
