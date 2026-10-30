import 'server-only';
import Stripe from 'stripe';
import { normalizeStripeRedirectUrl } from '@/lib/billing/stripe-redirect';
import { env } from '@/lib/env';
import type { BillingCadence, CatalogDestination, PlanKey } from '@/lib/finance/catalog';

export type StripeRuntimeConfig = {
  destination: Exclude<CatalogDestination, 'local'>;
  secretKey: string;
  webhookSecret: string;
};
export type StripeEffectResult =
  | { ok: true; reference: string; url: string | null; customerId?: string | null }
  | { ok: false; retryable: boolean; code: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED' };

let stripeClient: Stripe | null = null;

export function resolveStripeRuntimeConfig(
  source: {
    NODE_ENV?: string;
    STRIPE_DESTINATION?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
  } = { ...process.env, ...env },
): StripeRuntimeConfig | null {
  const destination = source.STRIPE_DESTINATION;
  if (!['test', 'sandbox', 'live', 'production'].includes(destination ?? '')) return null;
  if (source.NODE_ENV === 'production' && !['production', 'live'].includes(destination ?? ''))
    return null;
  if (!source.STRIPE_SECRET_KEY || !source.STRIPE_WEBHOOK_SECRET) return null;
  return {
    destination: destination as StripeRuntimeConfig['destination'],
    secretKey: source.STRIPE_SECRET_KEY,
    webhookSecret: source.STRIPE_WEBHOOK_SECRET,
  };
}

export function getStripeClient(config = resolveStripeRuntimeConfig()): Stripe {
  if (!config) throw new Error('STRIPE_PROVIDER_DISABLED');
  if (!stripeClient)
    stripeClient = new Stripe(config.secretKey, { timeout: 12_000, maxNetworkRetries: 1 });
  return stripeClient;
}

export async function createCheckoutSession(args: {
  operationId: string;
  effectKey: string;
  priceId: string;
  plan: PlanKey;
  cadence: BillingCadence;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  customerId?: string | null;
  client?: Stripe;
}): Promise<StripeEffectResult> {
  try {
    const session = await (args.client ?? getStripeClient()).checkout.sessions.create(
      {
        mode: 'subscription',
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        client_reference_id: args.operationId,
        customer: args.customerId ?? undefined,
        customer_email: args.customerId ? undefined : (args.customerEmail ?? undefined),
        line_items: [{ price: args.priceId, quantity: 1 }],
        // Diagnostic cross-check only. DB mappings remain authoritative.
        metadata: {
          operation_id: args.operationId,
          requested_plan: args.plan,
          requested_cadence: args.cadence,
        },
        subscription_data: { metadata: { operation_id: args.operationId } },
      },
      { idempotencyKey: args.effectKey },
    );
    const redirectUrl = normalizeStripeRedirectUrl(session.url);
    if (!redirectUrl) return { ok: false, retryable: false, code: 'PROVIDER_REJECTED' };
    return {
      ok: true,
      reference: session.id,
      url: redirectUrl,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    };
  } catch {
    return { ok: false, retryable: true, code: 'PROVIDER_UNAVAILABLE' };
  }
}

export async function createBillingPortalSession(args: {
  customerId: string;
  returnUrl: string;
  effectKey: string;
  client?: Stripe;
}): Promise<StripeEffectResult> {
  try {
    const session = await (args.client ?? getStripeClient()).billingPortal.sessions.create(
      { customer: args.customerId, return_url: args.returnUrl },
      { idempotencyKey: args.effectKey },
    );
    const redirectUrl = normalizeStripeRedirectUrl(session.url);
    if (!redirectUrl) return { ok: false, retryable: false, code: 'PROVIDER_REJECTED' };
    return { ok: true, reference: session.id, url: redirectUrl };
  } catch {
    return { ok: false, retryable: true, code: 'PROVIDER_UNAVAILABLE' };
  }
}

export async function scheduleSubscriptionChange(args: {
  subscriptionId: string;
  priceId?: string;
  cancel?: boolean;
  effectKey: string;
  client?: Stripe;
}): Promise<StripeEffectResult> {
  try {
    const stripe = args.client ?? getStripeClient();
    const current = await stripe.subscriptions.retrieve(args.subscriptionId);
    const item = current.items.data[0];
    if (!item) return { ok: false, retryable: false, code: 'PROVIDER_REJECTED' };
    if (args.cancel) {
      const updated = await stripe.subscriptions.update(
        args.subscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey: args.effectKey },
      );
      return { ok: true, reference: updated.id, url: null };
    }
    if (!args.priceId) return { ok: false, retryable: false, code: 'PROVIDER_REJECTED' };
    const currentSchedule =
      typeof current.schedule === 'string' ? current.schedule : current.schedule?.id;
    const schedule = currentSchedule
      ? await stripe.subscriptionSchedules.retrieve(currentSchedule)
      : await stripe.subscriptionSchedules.create(
          { from_subscription: current.id },
          { idempotencyKey: `${args.effectKey}:schedule` },
        );
    await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: 'release',
        phases: [
          {
            start_date: item.current_period_start,
            end_date: item.current_period_end,
            items: current.items.data.map((entry) => ({
              price: entry.price.id,
              quantity: entry.quantity ?? 1,
            })),
          },
          {
            start_date: item.current_period_end,
            items: [{ price: args.priceId, quantity: item.quantity ?? 1 }],
          },
        ],
      },
      { idempotencyKey: `${args.effectKey}:phases` },
    );
    return { ok: true, reference: current.id, url: null };
  } catch {
    return { ok: false, retryable: true, code: 'PROVIDER_UNAVAILABLE' };
  }
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
): Stripe.Event {
  const config = resolveStripeRuntimeConfig();
  if (!config) throw new Error('STRIPE_PROVIDER_DISABLED');
  return getStripeClient(config).webhooks.constructEvent(
    rawBody,
    signatureHeader,
    config.webhookSecret,
  );
}
