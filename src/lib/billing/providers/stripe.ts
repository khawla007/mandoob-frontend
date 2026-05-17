import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import { mapPriceIdToPlanFromEnv, type SubscriptionPlan } from '@/lib/billing/plans';

let stripeClient: Stripe | null = null;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv(env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY'));
  }
  return stripeClient;
}

export function mapPriceIdToPlan(priceId: string): SubscriptionPlan {
  return mapPriceIdToPlanFromEnv(priceId, env);
}

export async function createCheckoutSession(args: {
  tenantId: string;
  priceId: string;
  plan: SubscriptionPlan;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  customerId?: string | null;
}): Promise<{ url: string; sessionId: string }> {
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'subscription',
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: args.tenantId,
    customer: args.customerId ?? undefined,
    customer_email: args.customerId ? undefined : (args.customerEmail ?? undefined),
    line_items: [{ price: args.priceId, quantity: 1 }],
    subscription_data: {
      metadata: { tenant_id: args.tenantId, plan: args.plan },
    },
    metadata: { tenant_id: args.tenantId, plan: args.plan },
  });
  if (!session.url) throw new Error('Stripe Checkout session missing URL');
  return { url: session.url, sessionId: session.id };
}

export async function createBillingPortalSession(args: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl,
  });
  return { url: session.url, sessionId: session.id };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(
    rawBody,
    signatureHeader,
    requireEnv(env.STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET'),
  );
}
