import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapPriceIdToPlanFromEnv } from './plans';

const priceEnv = {
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_PROFESSIONAL: 'price_professional',
  STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
};

test('mapPriceIdToPlanFromEnv maps configured Stripe price IDs to plans', () => {
  assert.equal(mapPriceIdToPlanFromEnv('price_starter', priceEnv), 'starter');
  assert.equal(mapPriceIdToPlanFromEnv('price_professional', priceEnv), 'professional');
  assert.equal(mapPriceIdToPlanFromEnv('price_enterprise', priceEnv), 'enterprise');
});

test('mapPriceIdToPlanFromEnv rejects unknown Stripe price IDs', () => {
  assert.throws(() => mapPriceIdToPlanFromEnv('price_unknown', priceEnv), /Unknown Stripe price/);
});

