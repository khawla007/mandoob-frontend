import { createHash } from 'node:crypto';

export type StripeSubscriptionInput = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  canceled_at?: number | null;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      current_period_start?: number;
      current_period_end?: number;
      price: {
        id: string;
        unit_amount?: number | null;
        currency: string;
        recurring?: { interval?: string | null } | null;
      };
    }>;
  };
};
export type StripeEventInput = {
  id: string;
  created: number;
  type: string;
  data: { object: unknown };
};
export type NormalizedStripeSubscription = {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  amountMinor: number;
  currency: string;
  interval: 'month' | 'year';
  metadataTenantId: string | null;
};
export type StripeWebhookDeps = {
  destination: string;
  reserve(input: {
    providerEventId: string;
    bodyHash: string;
    providerCreated: number;
    eventType: string;
    customerId: string | null;
    subscriptionId: string | null;
  }): Promise<{ eventId: string; state: string }>;
  bindCustomer(input: {
    operationId: string;
    checkoutSessionId: string;
    customerId: string;
  }): Promise<void>;
  retrieveSubscription(id: string): Promise<StripeSubscriptionInput>;
  apply(eventId: string, subscription: NormalizedStripeSubscription): Promise<{ state: string }>;
};

const statuses = new Set([
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]);
export function normalizeAuthoritativeSubscription(
  input: StripeSubscriptionInput,
): NormalizedStripeSubscription {
  const item = input.items.data[0];
  const interval = item?.price.recurring?.interval;
  if (!item || (interval !== 'month' && interval !== 'year') || !statuses.has(input.status))
    throw new Error('UNSUPPORTED_SUBSCRIPTION');
  if (!Number.isSafeInteger(item.price.unit_amount) || (item.price.unit_amount ?? -1) < 0)
    throw new Error('INVALID_SUBSCRIPTION_AMOUNT');
  if (!item.current_period_start || !item.current_period_end)
    throw new Error('INVALID_SUBSCRIPTION_PERIOD');
  return {
    customerId: typeof input.customer === 'string' ? input.customer : input.customer.id,
    subscriptionId: input.id,
    priceId: item.price.id,
    status: input.status,
    periodStart: new Date(item.current_period_start * 1000).toISOString(),
    periodEnd: new Date(item.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: input.cancel_at_period_end,
    canceledAt: input.canceled_at ? new Date(input.canceled_at * 1000).toISOString() : null,
    amountMinor: item.price.unit_amount!,
    currency: item.price.currency.toUpperCase(),
    interval,
    metadataTenantId: input.metadata?.tenant_id ?? null,
  };
}

export async function handleVerifiedStripeEvent(
  event: StripeEventInput,
  rawBody: string,
  deps: StripeWebhookDeps,
): Promise<{ state: string }> {
  let subscription: StripeSubscriptionInput | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      id?: string;
      client_reference_id?: string | null;
      customer?: string | { id: string } | null;
      subscription?: string | { id: string } | null;
    };
    customerId =
      typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
    subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);
    if (!session.id || !session.client_reference_id || !customerId || !subscriptionId)
      return { state: 'ignored' };
    const reservation = await deps.reserve({
      providerEventId: event.id,
      bodyHash: createHash('sha256').update(rawBody).digest('hex'),
      providerCreated: event.created,
      eventType: event.type,
      customerId,
      subscriptionId,
    });
    if (['applied', 'duplicate', 'stale'].includes(reservation.state))
      return { state: reservation.state };
    await deps.bindCustomer({
      operationId: session.client_reference_id,
      checkoutSessionId: session.id,
      customerId,
    });
    subscription = await deps.retrieveSubscription(subscriptionId);
    return deps.apply(reservation.eventId, normalizeAuthoritativeSubscription(subscription));
  } else if (
    [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].includes(event.type)
  ) {
    subscription = event.data.object as StripeSubscriptionInput;
    customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    subscriptionId = subscription.id;
  } else return { state: 'ignored' };
  const reservation = await deps.reserve({
    providerEventId: event.id,
    bodyHash: createHash('sha256').update(rawBody).digest('hex'),
    providerCreated: event.created,
    eventType: event.type,
    customerId,
    subscriptionId,
  });
  if (['applied', 'duplicate', 'stale'].includes(reservation.state))
    return { state: reservation.state };
  return deps.apply(reservation.eventId, normalizeAuthoritativeSubscription(subscription));
}
