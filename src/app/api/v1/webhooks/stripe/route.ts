import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { enqueueEmail } from '@/lib/mail/send';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  getStripeClient,
  mapPriceIdToPlan,
  verifyWebhookSignature,
} from '@/lib/billing/providers/stripe';
import { isMaterialSubscriptionChange, normalizeStripeSubscription } from '@/lib/billing/webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Supa = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';
  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const outcome = await handleStripeEvent(supabase, event);
  return NextResponse.json({ ok: true, outcome });
}

export async function handleStripeEvent(supabase: Supa, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(supabase, event.data.object as Stripe.Subscription);
    case 'invoice.paid':
      return handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
    default:
      return 'ignored';
  }
}

async function handleCheckoutCompleted(
  supabase: Supa,
  session: Stripe.Checkout.Session,
): Promise<string> {
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return 'noop';
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  return syncSubscription(supabase, subscription);
}

async function syncSubscription(supabase: Supa, subscription: Stripe.Subscription): Promise<string> {
  const tenantId = subscription.metadata?.tenant_id;
  if (!tenantId) return 'noop';
  const row = normalizeStripeSubscription(subscription, mapPriceIdToPlan);

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, status, current_period_end')
    .eq('stripe_subscription_id', row.stripe_subscription_id)
    .maybeSingle();

  if (existing && !isMaterialSubscriptionChange(existing, row)) return 'noop';

  await supabase
    .from('subscriptions')
    .upsert({ tenant_id: tenantId, ...row }, { onConflict: 'stripe_subscription_id' });

  await supabase
    .from('tenant_payment_config')
    .upsert(
      {
        tenant_id: tenantId,
        provider: 'stripe',
        merchant_id: row.stripe_customer_id,
        secret_encrypted: row.stripe_subscription_id,
        webhook_secret_encrypted: row.stripe_price_id,
        enabled: true,
      },
      { onConflict: 'tenant_id,provider' },
    );

  if (row.status === 'active' || row.status === 'trialing') {
    await supabase.from('tenants').update({ plan: row.plan, status: 'active' }).eq('id', tenantId);
    if (existing?.status === 'past_due' || existing?.status === 'unpaid') {
      await auditTenant(supabase, tenantId, 'reactivated', {
        entity: 'subscription',
        reason: 'subscription_payment_recovered',
        stripe_subscription_id: row.stripe_subscription_id,
      });
    }
  }

  if (row.status === 'unpaid' || row.status === 'canceled') {
    await suspendTenantForBilling(supabase, tenantId, row.stripe_subscription_id);
  }

  return existing ? 'updated' : 'inserted';
}

async function handleInvoicePaid(supabase: Supa, invoice: Stripe.Invoice): Promise<string> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return 'noop';
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tenant_id, plan')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (!sub) return 'noop';

  const email = invoice.customer_email;
  if (email) {
    await enqueueEmail({
      tenantId: sub.tenant_id,
      templateId: 'subscription-receipt',
      toAddress: email,
      input: {
        tenantName: 'Mandoob',
        plan: sub.plan,
        amount: invoice.amount_paid ? `$${(invoice.amount_paid / 100).toFixed(2)}` : '$0.00',
        receiptUrl: invoice.hosted_invoice_url ?? '',
      },
      linked: { entityType: 'subscription_invoice', entityId: invoice.id },
    });
  }
  return 'receipt_queued';
}

async function handleInvoicePaymentFailed(supabase: Supa, invoice: Stripe.Invoice): Promise<string> {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return 'noop';
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  if (subscription.status !== 'unpaid' && subscription.status !== 'canceled') {
    return syncSubscription(supabase, subscription);
  }
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (!sub) return 'noop';
  await suspendTenantForBilling(supabase, sub.tenant_id, subscriptionId);
  return 'suspended';
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const value =
    invoice.parent?.type === 'subscription_details'
      ? invoice.parent.subscription_details?.subscription
      : null;
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function suspendTenantForBilling(
  supabase: Supa,
  tenantId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('status, name')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenant?.status !== 'suspended') {
    await supabase.from('tenants').update({ status: 'suspended' }).eq('id', tenantId);
    await auditTenant(supabase, tenantId, 'suspended', {
      entity: 'subscription',
      reason: 'subscription_payment_failed',
      stripe_subscription_id: stripeSubscriptionId,
    });
  }
}

async function auditTenant(
  supabase: Supa,
  tenantId: string,
  action: 'suspended' | 'reactivated',
  details: Record<string, unknown>,
): Promise<void> {
  await supabase.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: null,
    action,
    source: 'system',
    details,
  });
}
