import type { BillingCadence, PlanKey } from '@/lib/finance/catalog';
export type SubscriptionPlan = PlanKey;

export type AuthoritativeStripePrice = {
  providerPriceId: string;
  plan: PlanKey;
  cadence: BillingCadence;
  amountMinor: number;
  currency: string;
  interval: 'month' | 'year';
};

export function resolveMappedStripePrice(
  priceId: string,
  mappings: readonly AuthoritativeStripePrice[],
): AuthoritativeStripePrice {
  const matches = mappings.filter((mapping) => mapping.providerPriceId === priceId);
  if (matches.length !== 1) throw new Error('STRIPE_PRICE_MAPPING_UNAVAILABLE');
  return matches[0]!;
}
