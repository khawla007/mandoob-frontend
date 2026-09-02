import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { SourceState } from '@/lib/settings/provider-state';

const BILLING_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'incomplete',
  'canceled',
  'cancelled',
]);

export type BillingSubscription = {
  plan: string;
  status: 'active' | 'trialing' | 'past_due' | 'incomplete' | 'canceled' | 'cancelled';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  unitAmountMinor: number;
  currency: string;
  interval: string;
};

export type BillingSubscriptionSnapshot = SourceState<BillingSubscription | null>;

/** Returns display-safe subscription facts only; provider identifiers never leave this boundary. */
export async function getBillingSubscriptionSnapshot(
  tenantId: string,
): Promise<BillingSubscriptionSnapshot> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('subscriptions')
    .select(
      'plan, status, current_period_end, cancel_at_period_end, canceled_at, unit_amount_minor, currency, interval',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || (data && !BILLING_STATUSES.has(data.status as string))) {
    return { status: 'unavailable' };
  }
  if (!data) return { status: 'ready', data: null };

  return {
    status: 'ready',
    data: {
      plan: String(data.plan),
      status: data.status as BillingSubscription['status'],
      currentPeriodEnd: data.current_period_end as string | null,
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
      canceledAt: (data.canceled_at as string | null) ?? null,
      unitAmountMinor: Number(data.unit_amount_minor),
      currency: String(data.currency),
      interval: String(data.interval),
    },
  };
}
