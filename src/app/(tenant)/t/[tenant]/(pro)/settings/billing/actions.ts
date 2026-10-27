'use server';

import 'server-only';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { enforcePrivilegedSession } from '@/lib/auth/require-role';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
  createBillingPortalSession,
  createCheckoutSession,
  resolveStripeRuntimeConfig,
  scheduleSubscriptionChange,
} from '@/lib/billing/providers/stripe';
import { runStripeEffect, type StripeIntent } from '@/lib/billing/stripe-coordinator';
import { normalizeStripeRedirectUrl } from '@/lib/billing/stripe-redirect';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type BillingActionResult =
  | { ok: true; redirectUrl: string | null; code: 'READY' }
  | {
      ok: false;
      code: 'VALIDATION_FAILED' | 'PROVIDER_DISABLED' | 'PROVIDER_UNAVAILABLE' | 'STALE_VERSION';
      errorKey: string;
    };

const base = z.object({ tenantSlug: z.string().trim().min(1), operationId: z.string().uuid() });
const checkout = base.extend({
  catalogVersionId: z.string().uuid(),
  plan: z.enum(['starter', 'professional', 'enterprise']),
  cadence: z.enum(['monthly', 'annual']),
});
const change = checkout.extend({ expectedVersion: z.coerce.number().int().nonnegative() });
const versioned = base.extend({ expectedVersion: z.coerce.number().int().nonnegative() });

function formObject(form: FormData) {
  return Object.fromEntries(form.entries());
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function unavailable(
  code: 'VALIDATION_FAILED' | 'PROVIDER_DISABLED' | 'PROVIDER_UNAVAILABLE' | 'STALE_VERSION',
): BillingActionResult {
  return {
    ok: false,
    code,
    errorKey:
      code === 'VALIDATION_FAILED'
        ? 'billingValidationFailed'
        : code === 'STALE_VERSION'
          ? 'billingStaleVersion'
          : 'billingProviderUnavailable',
  };
}
async function authority(slug: string) {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await enforcePrivilegedSession(session);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenant.slug);
  if (!company || company.tenantId !== tenant.id) throw new Error('FORBIDDEN');
  return { session, tenant, company };
}
function parseIntent(data: unknown): StripeIntent {
  const row = data as Record<string, unknown>;
  return {
    operationId: String(row.operationId),
    effectKey: String(row.effectKey),
    effectToken: typeof row.effectToken === 'string' ? row.effectToken : null,
    providerPriceId: typeof row.providerPriceId === 'string' ? row.providerPriceId : null,
    state: String(row.state) as StripeIntent['state'],
    providerReference: typeof row.providerReference === 'string' ? row.providerReference : null,
    redirectUrl: typeof row.redirectUrl === 'string' ? row.redirectUrl : null,
  };
}
function trustedUrl(path: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) return null;
  const url = new URL(path, baseUrl);
  const origin = new URL(baseUrl);
  return url.origin === origin.origin ? url.toString() : null;
}

async function execute(input: {
  tenantSlug: string;
  operationId: string;
  kind: 'checkout' | 'portal' | 'change' | 'cancel';
  catalogVersionId?: string;
  plan?: 'starter' | 'professional' | 'enterprise';
  cadence?: 'monthly' | 'annual';
  expectedVersion?: number;
}): Promise<BillingActionResult> {
  try {
    const auth = await authority(input.tenantSlug);
    const config = resolveStripeRuntimeConfig();
    if (!config) return unavailable('PROVIDER_DISABLED');
    const client = createSupabaseServiceRoleClient();
    const payloadHash = hash(input);
    let subscriptionId: string | null = null;
    let customerId: string | null = null;
    if (input.kind !== 'checkout') {
      const [mapping, subscription] = await Promise.all([
        client
          .from('stripe_customer_mappings')
          .select('stripe_customer_id,destination')
          .eq('tenant_id', auth.tenant.id)
          .maybeSingle(),
        client
          .from('subscriptions')
          .select('stripe_subscription_id,version,destination')
          .eq('tenant_id', auth.tenant.id)
          .maybeSingle(),
      ]);
      if (mapping.error || !mapping.data || mapping.data.destination !== config.destination)
        return unavailable('PROVIDER_DISABLED');
      customerId = String(mapping.data.stripe_customer_id);
      if (input.kind !== 'portal') {
        if (
          subscription.error ||
          !subscription.data ||
          Number(subscription.data.version) !== input.expectedVersion
        )
          return unavailable('STALE_VERSION');
        subscriptionId = String(subscription.data.stripe_subscription_id);
      }
    }
    const result = await runStripeEffect({
      reserve: async () => {
        const { data, error } = await client.rpc(
          'p309_reserve_stripe_operation' as never,
          {
            p_tenant_id: auth.tenant.id,
            p_company_id: auth.company.id,
            p_actor_id: auth.session.id,
            p_operation_id: input.operationId,
            p_operation_kind: input.kind,
            p_destination: config.destination,
            p_catalog_version_id: input.catalogVersionId ?? null,
            p_plan_key: input.plan ?? null,
            p_cadence: input.cadence ?? null,
            p_expected_version: input.expectedVersion ?? null,
            p_payload_hash: payloadHash,
          } as never,
        );
        if (error || !data) throw new Error('RESERVATION_UNAVAILABLE');
        return parseIntent(data);
      },
      create: async (intent) => {
        const settings = trustedUrl(`/t/${auth.tenant.slug}/settings/billing`);
        if (!settings) return { ok: false, retryable: false, code: 'PROVIDER_REJECTED' } as const;
        const providerResult =
          input.kind === 'checkout'
            ? await createCheckoutSession({
                operationId: input.operationId,
                effectKey: intent.effectKey,
                priceId: intent.providerPriceId!,
                plan: input.plan!,
                cadence: input.cadence!,
                successUrl: `${settings}?checkout=success`,
                cancelUrl: `${settings}?checkout=cancelled`,
                customerEmail: auth.session.email,
              })
            : input.kind === 'portal'
              ? await createBillingPortalSession({
                  customerId: customerId!,
                  returnUrl: settings,
                  effectKey: intent.effectKey,
                })
              : await scheduleSubscriptionChange({
                  subscriptionId: subscriptionId!,
                  priceId: intent.providerPriceId ?? undefined,
                  cancel: input.kind === 'cancel',
                  effectKey: intent.effectKey,
                });
        return providerResult.ok
          ? { ok: true, effect: { reference: providerResult.reference, url: providerResult.url } }
          : providerResult;
      },
      attach: async (intent, effect) => {
        const redirectUrl = effect.url ? normalizeStripeRedirectUrl(effect.url) : null;
        if (effect.url && !redirectUrl) throw new Error('REDIRECT_UNAVAILABLE');
        const { data, error } = await client.rpc(
          'p309_attach_stripe_operation' as never,
          {
            p_operation_id: input.operationId,
            p_effect_token: intent.effectToken,
            p_provider_reference: effect.reference,
            p_redirect_url: redirectUrl,
          } as never,
        );
        if (error || !data) throw new Error('ATTACH_UNAVAILABLE');
        return parseIntent(data);
      },
      markUnknown: async (code) => {
        await client.rpc(
          'p309_mark_stripe_operation_unknown' as never,
          { p_operation_id: input.operationId, p_failure_code: code } as never,
        );
      },
    });
    return result.ok
      ? { ok: true, redirectUrl: result.redirectUrl, code: 'READY' }
      : unavailable('PROVIDER_UNAVAILABLE');
  } catch {
    return unavailable('PROVIDER_UNAVAILABLE');
  }
}

export async function startCheckoutAction(formData: FormData): Promise<BillingActionResult> {
  const parsed = checkout.safeParse(formObject(formData));
  return parsed.success
    ? execute({ ...parsed.data, kind: 'checkout' })
    : unavailable('VALIDATION_FAILED');
}
export async function openBillingPortalAction(formData: FormData): Promise<BillingActionResult> {
  const parsed = base.safeParse(formObject(formData));
  return parsed.success
    ? execute({ ...parsed.data, kind: 'portal' })
    : unavailable('VALIDATION_FAILED');
}
export async function changeSubscriptionAction(formData: FormData): Promise<BillingActionResult> {
  const parsed = change.safeParse(formObject(formData));
  return parsed.success
    ? execute({ ...parsed.data, kind: 'change' })
    : unavailable('VALIDATION_FAILED');
}
export async function cancelSubscriptionAction(formData: FormData): Promise<BillingActionResult> {
  const parsed = versioned.safeParse(formObject(formData));
  return parsed.success
    ? execute({ ...parsed.data, kind: 'cancel' })
    : unavailable('VALIDATION_FAILED');
}

function billingReturnPath(formData: FormData, state: string): string {
  const slug = String(formData.get('tenantSlug') ?? '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u.test(slug)) return '/';
  return `/t/${slug}/settings/billing?billing=${encodeURIComponent(state)}`;
}

async function runBillingFormAction(
  formData: FormData,
  action: (input: FormData) => Promise<BillingActionResult>,
): Promise<never> {
  // Keep the exported form-action boundary independently guarded. The
  // delegated billing action repeats the full active-tenant, AAL2 and
  // assigned-company checks before any provider or service-role effect.
  await requireProTenantRouteAccess(String(formData.get('tenantSlug') ?? ''));
  const result = await action(formData);
  if (result.ok && result.redirectUrl) {
    const redirectUrl = normalizeStripeRedirectUrl(result.redirectUrl);
    if (redirectUrl) redirect(redirectUrl);
  }
  redirect(billingReturnPath(formData, result.ok ? 'scheduled' : result.code.toLowerCase()));
}

export async function startCheckoutFormAction(formData: FormData): Promise<never> {
  return runBillingFormAction(formData, startCheckoutAction);
}
export async function openBillingPortalFormAction(formData: FormData): Promise<never> {
  return runBillingFormAction(formData, openBillingPortalAction);
}
export async function changeSubscriptionFormAction(formData: FormData): Promise<never> {
  return runBillingFormAction(formData, changeSubscriptionAction);
}
export async function cancelSubscriptionFormAction(formData: FormData): Promise<never> {
  return runBillingFormAction(formData, cancelSubscriptionAction);
}
