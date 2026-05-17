import { inferPlanFromPriceId, type SubscriptionPlan } from './plans';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export type SubscriptionUpsert = {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  unit_amount_minor: number;
  currency: string;
  interval: 'month' | 'year';
};

export type StripeSubscriptionLike = {
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

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
];

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  if (SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) {
    return status as SubscriptionStatus;
  }
  throw new Error(`Unsupported Stripe subscription status: ${status}`);
}

export function timestampToIso(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

export function normalizeStripeSubscription(
  subscription: StripeSubscriptionLike,
  mapPriceIdToPlan: (priceId: string) => SubscriptionPlan = inferPlanFromPriceId,
): SubscriptionUpsert {
  const item = subscription.items.data[0];
  if (!item?.price?.id) throw new Error('Stripe subscription missing price');
  const interval = item.price.recurring?.interval;
  if (interval !== 'month' && interval !== 'year') {
    throw new Error(`Unsupported Stripe subscription interval: ${interval ?? 'none'}`);
  }
  const customer =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  return {
    stripe_customer_id: customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item.price.id,
    plan: mapPriceIdToPlan(item.price.id),
    status: mapStripeSubscriptionStatus(subscription.status),
    current_period_start: timestampToIso(item.current_period_start),
    current_period_end: timestampToIso(item.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: timestampToIso(subscription.canceled_at),
    unit_amount_minor: item.price.unit_amount ?? 0,
    currency: item.price.currency.toUpperCase(),
    interval,
  };
}

export function isMaterialSubscriptionChange(
  existing: { status: string | null; current_period_end: string | null },
  incoming: { status: string | null; current_period_end: string | null },
): boolean {
  return (
    existing.status !== incoming.status || existing.current_period_end !== incoming.current_period_end
  );
}
