'use server';

import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { env } from '@/lib/env';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createCheckoutSession, createBillingPortalSession, getStripeClient } from '@/lib/billing/providers/stripe';
import type { SubscriptionPlan } from '@/lib/billing/plans';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const PRICE_BY_PLAN: Record<SubscriptionPlan, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER,
  professional: env.STRIPE_PRICE_PROFESSIONAL,
  enterprise: env.STRIPE_PRICE_ENTERPRISE,
};

async function resolveBillingCaller(slug: string) {
  const session = await requireRole('pro', 'admin');
  if (!session.tenantId) throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  await requireActiveTenant(tenant.id);
  const hdr = await headers();
  return {
    userId: session.id,
    tenant,
    origin: hdr.get('origin') ?? `https://${hdr.get('host') ?? env.NEXT_PUBLIC_ROOT_DOMAIN}`,
    ip: hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
  };
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '');
  const plan = String(formData.get('plan') ?? '') as SubscriptionPlan;
  const ctx = await resolveBillingCaller(tenantSlug);
  const allowed = await consumeRateLimit({
    key: `billing:${ctx.tenant.id}`,
    capacity: 20,
    refillPerSec: 20 / 3600,
  });
  if (!allowed) throw new ApiError('RATE_LIMITED', 'Too many billing attempts', 429);

  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) throw new ApiError('NOT_CONFIGURED', 'Stripe price is not configured', 503);

  const admin = createSupabaseServiceRoleClient();
  const { data: existing } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', ctx.tenant.id)
    .maybeSingle();

  const checkout = await createCheckoutSession({
    tenantId: ctx.tenant.id,
    priceId,
    plan,
    successUrl: `${ctx.origin}/t/${ctx.tenant.slug}/settings/billing?checkout=success`,
    cancelUrl: `${ctx.origin}/t/${ctx.tenant.slug}/settings/billing?checkout=cancelled`,
    customerId: existing?.stripe_customer_id ?? null,
  });

  await admin.from('tenant_audit_log').insert({
    tenant_id: ctx.tenant.id,
    actor_id: ctx.userId,
    action: 'updated',
    source: 'self_serve',
    details: {
      entity: 'subscription',
      event: 'subscription_checkout_started',
      plan,
      stripe_checkout_session_id: checkout.sessionId,
      ip: ctx.ip,
    },
  });

  redirect(checkout.url);
}

export async function openBillingPortalAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '');
  const ctx = await resolveBillingCaller(tenantSlug);
  const admin = createSupabaseServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', ctx.tenant.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) throw new ApiError('NOT_FOUND', 'Subscription not found', 404);
  const portal = await createBillingPortalSession({
    customerId: sub.stripe_customer_id,
    returnUrl: `${ctx.origin}/t/${ctx.tenant.slug}/settings/billing`,
  });
  redirect(portal.url);
}

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '');
  const ctx = await resolveBillingCaller(tenantSlug);
  const admin = createSupabaseServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('tenant_id', ctx.tenant.id)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) throw new ApiError('NOT_FOUND', 'Subscription not found', 404);
  await getStripeClient().subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  redirect(`/t/${ctx.tenant.slug}/settings/billing`);
}

