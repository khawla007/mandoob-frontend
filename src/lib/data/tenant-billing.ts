import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  toBillingSubscriptionSnapshot,
  type BillingSubscription,
  type BillingSubscriptionSnapshot,
} from './billing-subscription';
import type { BillingCadence, PlanKey } from '@/lib/finance/catalog';

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
      'version, plan, status, current_period_end, cancel_at_period_end, canceled_at, unit_amount_minor, currency, interval, pending_plan, pending_cadence, pending_effective_at',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return toBillingSubscriptionSnapshot({ data, error });
}

export type BillingPlanOption = {
  plan: PlanKey;
  cadence: BillingCadence;
  amountMinor: number;
  currency: string;
};

export type BillingManagementSnapshot =
  | { status: 'unavailable' }
  | {
      status: 'ready';
      data: null | { catalogVersionId: string; options: BillingPlanOption[] };
    };

const planKeys = new Set<PlanKey>(['starter', 'professional', 'enterprise']);
const cadences = new Set<BillingCadence>(['monthly', 'annual']);

/** Returns only active, enabled, exact-mapped catalog facts safe to render in forms. */
export async function getBillingManagementSnapshot(
  tenantId: string,
  destination: 'test' | 'sandbox' | 'live' | 'production' | null,
): Promise<BillingManagementSnapshot> {
  if (!destination) return { status: 'ready', data: null };
  const admin = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const catalog = await admin
    .from('subscription_catalog_versions')
    .select('id,catalog_class,currency')
    .eq('state', 'active')
    .lte('effective_from', now)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (catalog.error) return { status: 'unavailable' };
  if (!catalog.data) return { status: 'ready', data: null };
  if (
    (destination === 'live' || destination === 'production') &&
    String(catalog.data.catalog_class) === 'demo'
  ) {
    return { status: 'ready', data: null };
  }
  if (destination === 'production' && String(catalog.data.catalog_class) === 'local') {
    return { status: 'ready', data: null };
  }
  const catalogVersionId = String(catalog.data.id);
  const [enablement, mappings, customerMapping, subscription] = await Promise.all([
    admin
      .from('subscription_provider_enablement')
      .select('enabled')
      .eq('catalog_version_id', catalogVersionId)
      .eq('provider', 'stripe')
      .eq('destination', destination)
      .maybeSingle(),
    admin
      .from('subscription_provider_price_mappings')
      .select('plan_key,cadence,amount_minor,currency')
      .eq('catalog_version_id', catalogVersionId)
      .eq('provider', 'stripe')
      .eq('destination', destination),
    admin
      .from('stripe_customer_mappings')
      .select('destination')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin.from('subscriptions').select('destination').eq('tenant_id', tenantId).maybeSingle(),
  ]);
  if (enablement.error || mappings.error || customerMapping.error || subscription.error) {
    return { status: 'unavailable' };
  }
  if (!enablement.data?.enabled) return { status: 'ready', data: null };
  if (
    subscription.data &&
    (!customerMapping.data ||
      subscription.data.destination !== destination ||
      customerMapping.data.destination !== destination)
  ) {
    return { status: 'ready', data: null };
  }
  const options: BillingPlanOption[] = [];
  for (const row of mappings.data ?? []) {
    const plan = String(row.plan_key) as PlanKey;
    const cadence = String(row.cadence) as BillingCadence;
    const amountMinor = Number(row.amount_minor);
    const currency = String(row.currency);
    if (
      !planKeys.has(plan) ||
      !cadences.has(cadence) ||
      !Number.isSafeInteger(amountMinor) ||
      amountMinor < 0 ||
      !/^[A-Z]{3}$/u.test(currency)
    ) {
      return { status: 'unavailable' };
    }
    options.push({ plan, cadence, amountMinor, currency });
  }
  if (options.length === 0) return { status: 'ready', data: null };
  options.sort((a, b) => a.amountMinor - b.amountMinor || a.plan.localeCompare(b.plan));
  return { status: 'ready', data: { catalogVersionId, options } };
}
