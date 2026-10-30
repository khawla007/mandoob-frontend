import { NextResponse } from 'next/server';
import {
  getStripeClient,
  resolveStripeRuntimeConfig,
  verifyWebhookSignature,
} from '@/lib/billing/providers/stripe';
import {
  handleVerifiedStripeEvent,
  type NormalizedStripeSubscription,
} from '@/lib/billing/stripe-webhook';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const config = resolveStripeRuntimeConfig();
  if (!config)
    return NextResponse.json(
      { error: 'provider unavailable', code: 'PROVIDER_DISABLED' },
      { status: 503 },
    );
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature)
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 400 });
  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch {
    return NextResponse.json({ error: 'invalid signature', code: 'FORBIDDEN' }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  try {
    const outcome = await handleVerifiedStripeEvent(event, rawBody, {
      destination: config.destination,
      bindCustomer: async (input) => {
        const { error } = await client.rpc(
          'p309_bind_stripe_customer' as never,
          {
            p_operation_id: input.operationId,
            p_provider_reference: input.checkoutSessionId,
            p_stripe_customer_id: input.customerId,
          } as never,
        );
        if (error) throw new Error('STRIPE_MAPPING_UNAVAILABLE');
      },
      retrieveSubscription: async (id) => getStripeClient(config).subscriptions.retrieve(id),
      reserve: async (input) => {
        const { data, error } = await client.rpc(
          'p309_reserve_stripe_event' as never,
          {
            p_destination: config.destination,
            p_provider_event_id: input.providerEventId,
            p_body_hash: input.bodyHash,
            p_provider_created: input.providerCreated,
            p_event_type: input.eventType,
            p_stripe_customer_id: input.customerId,
            p_stripe_subscription_id: input.subscriptionId,
          } as never,
        );
        if (error || !data) throw new Error('STRIPE_EVENT_RESERVATION_UNAVAILABLE');
        const row = data as Record<string, unknown>;
        return { eventId: String(row.eventId), state: String(row.state) };
      },
      apply: async (eventId, subscription: NormalizedStripeSubscription) => {
        const { data, error } = await client.rpc(
          'p309_apply_stripe_subscription_event' as never,
          {
            p_event_id: eventId,
            p_stripe_customer_id: subscription.customerId,
            p_stripe_subscription_id: subscription.subscriptionId,
            p_provider_price_id: subscription.priceId,
            p_status: subscription.status,
            p_period_start: subscription.periodStart,
            p_period_end: subscription.periodEnd,
            p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
            p_canceled_at: subscription.canceledAt,
            p_amount_minor: subscription.amountMinor,
            p_currency: subscription.currency,
            p_interval: subscription.interval,
            p_metadata_tenant_id: subscription.metadataTenantId,
          } as never,
        );
        if (error || !data) throw new Error('STRIPE_EVENT_APPLY_UNAVAILABLE');
        return { state: String((data as Record<string, unknown>).state) };
      },
    });
    return NextResponse.json({ ok: true, outcome });
  } catch {
    return NextResponse.json(
      { error: 'provider event unavailable', code: 'RETRYABLE' },
      { status: 503 },
    );
  }
}
