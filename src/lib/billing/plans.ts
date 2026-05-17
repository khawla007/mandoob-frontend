export type SubscriptionPlan = 'starter' | 'professional' | 'enterprise';

export type StripePriceEnv = {
  STRIPE_PRICE_STARTER?: string;
  STRIPE_PRICE_PROFESSIONAL?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
};

const PLAN_BY_ENV_KEY: Array<[keyof StripePriceEnv, SubscriptionPlan]> = [
  ['STRIPE_PRICE_STARTER', 'starter'],
  ['STRIPE_PRICE_PROFESSIONAL', 'professional'],
  ['STRIPE_PRICE_ENTERPRISE', 'enterprise'],
];

export function mapPriceIdToPlanFromEnv(priceId: string, env: StripePriceEnv): SubscriptionPlan {
  for (const [key, plan] of PLAN_BY_ENV_KEY) {
    if (env[key] === priceId) return plan;
  }
  throw new Error(`Unknown Stripe price: ${priceId}`);
}

export function inferPlanFromPriceId(priceId: string): SubscriptionPlan {
  const normalized = priceId.toLowerCase();
  if (normalized.includes('starter')) return 'starter';
  if (normalized.includes('professional')) return 'professional';
  if (normalized.includes('enterprise')) return 'enterprise';
  throw new Error(`Unknown Stripe price: ${priceId}`);
}

