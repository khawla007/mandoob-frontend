import type { SourceState } from '@/lib/settings/provider-state';

export type BillingSubscription = {
  version: number;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  unitAmountMinor: number;
  currency: string;
  interval: string;
  pendingPlan: string | null;
  pendingCadence: string | null;
  pendingEffectiveAt: string | null;
};

export type BillingSubscriptionSnapshot = SourceState<BillingSubscription | null>;

type BillingSourceRow = {
  version: unknown;
  plan: unknown;
  status: unknown;
  current_period_end: unknown;
  cancel_at_period_end: unknown;
  canceled_at: unknown;
  unit_amount_minor: unknown;
  currency: unknown;
  interval: unknown;
  pending_plan: unknown;
  pending_cadence: unknown;
  pending_effective_at: unknown;
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
      version:
        Number.isSafeInteger(Number(data.version)) && Number(data.version) >= 0
          ? Number(data.version)
          : 0,
      plan: String(data.plan),
      status: String(data.status),
      currentPeriodEnd:
        typeof data.current_period_end === 'string' ? data.current_period_end : null,
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
      canceledAt: typeof data.canceled_at === 'string' ? data.canceled_at : null,
      unitAmountMinor: Number(data.unit_amount_minor),
      currency: String(data.currency),
      interval: String(data.interval),
      pendingPlan: typeof data.pending_plan === 'string' ? data.pending_plan : null,
      pendingCadence: typeof data.pending_cadence === 'string' ? data.pending_cadence : null,
      pendingEffectiveAt:
        typeof data.pending_effective_at === 'string' ? data.pending_effective_at : null,
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
