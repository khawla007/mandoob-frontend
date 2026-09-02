import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  toBillingSubscriptionSnapshot,
  type BillingSubscription,
  type BillingSubscriptionSnapshot,
} from './billing-subscription';

export type { BillingSubscription, BillingSubscriptionSnapshot };
export { billingCancellationState, billingStatusKey } from './billing-subscription';

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
  return toBillingSubscriptionSnapshot({ data, error });
}
