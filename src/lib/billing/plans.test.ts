import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveMappedStripePrice } from './plans';
const mapping = {
  providerPriceId: 'price_exact',
  plan: 'starter' as const,
  cadence: 'monthly' as const,
  amountMinor: 19_900,
  currency: 'AED',
  interval: 'month' as const,
};
test('resolves only an exact authoritative database mapping', () => {
  assert.equal(resolveMappedStripePrice('price_exact', [mapping]), mapping);
  assert.throws(() => resolveMappedStripePrice('price_unknown', [mapping]), /MAPPING_UNAVAILABLE/u);
  assert.throws(
    () => resolveMappedStripePrice('price_exact', [mapping, mapping]),
    /MAPPING_UNAVAILABLE/u,
  );
});
