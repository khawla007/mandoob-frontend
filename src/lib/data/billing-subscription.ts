import type { SourceState } from '@/lib/settings/provider-state';

export type BillingSubscription = {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  unitAmountMinor: number;
  currency: string;
  interval: string;
};

export type BillingSubscriptionSnapshot = SourceState<BillingSubscription | null>;

type BillingSourceRow = {
  plan: unknown;
  status: unknown;
  current_period_end: unknown;
  cancel_at_period_end: unknown;
  canceled_at: unknown;
  unit_amount_minor: unknown;
  currency: unknown;
  interval: unknown;
};

export function toBillingSubscriptionSnapshot({
  data,
  error,
}: {
  data: BillingSourceRow | null;
  error: unknown;
}): BillingSubscriptionSnapshot {
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ready', data: null };
  return {
    status: 'ready',
    data: {
      plan: String(data.plan),
      status: String(data.status),
      currentPeriodEnd:
        typeof data.current_period_end === 'string' ? data.current_period_end : null,
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
      canceledAt: typeof data.canceled_at === 'string' ? data.canceled_at : null,
      unitAmountMinor: Number(data.unit_amount_minor),
      currency: String(data.currency),
      interval: String(data.interval),
    },
  };
}

export function billingCancellationState(
  subscription: BillingSubscription,
): 'cancelled' | 'scheduled' | 'not_scheduled' {
  if (
    subscription.status === 'canceled' ||
    subscription.status === 'cancelled' ||
    subscription.canceledAt
  ) {
    return 'cancelled';
  }
  return subscription.cancelAtPeriodEnd ? 'scheduled' : 'not_scheduled';
}

export function billingStatusKey(
  status: string,
):
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'unpaid'
  | 'canceled'
  | 'cancelled'
  | 'unknown' {
  return [
    'active',
    'trialing',
    'past_due',
    'incomplete',
    'incomplete_expired',
    'paused',
    'unpaid',
    'canceled',
    'cancelled',
  ].includes(status)
    ? (status as ReturnType<typeof billingStatusKey>)
    : 'unknown';
}
