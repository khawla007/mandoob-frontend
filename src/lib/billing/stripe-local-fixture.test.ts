import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalStripeEffect } from './stripe-local-fixture';
test('local Stripe fixture is deterministic per durable effect key', () => {
  const first = createLocalStripeEffect('mandoob:stripe:checkout:1', 'checkout');
  assert.deepEqual(first, createLocalStripeEffect('mandoob:stripe:checkout:1', 'checkout'));
  assert.match(first.reference, /^cs_test_/u);
});
