import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isMaterialSubscriptionChange,
  mapStripeSubscriptionStatus,
  normalizeStripeSubscription,
} from './webhook';

test('normalizeStripeSubscription maps Stripe subscription data to database fields', () => {
  const row = normalizeStripeSubscription({
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    items: {
      data: [
        {
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: {
            id: 'price_professional',
            unit_amount: 9900,
            currency: 'usd',
            recurring: { interval: 'month' as const },
          },
        },
      ],
    },
  });

  assert.deepEqual(row, {
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
    stripe_price_id: 'price_professional',
    plan: 'professional',
    status: 'active',
    current_period_start: '2023-11-14T22:13:20.000Z',
    current_period_end: '2023-12-14T22:13:20.000Z',
    cancel_at_period_end: false,
    canceled_at: null,
    unit_amount_minor: 9900,
    currency: 'USD',
    interval: 'month',
  });
});

test('mapStripeSubscriptionStatus only accepts subscription lifecycle statuses', () => {
  assert.equal(mapStripeSubscriptionStatus('past_due'), 'past_due');
  assert.throws(() => mapStripeSubscriptionStatus('paid'), /Unsupported Stripe subscription status/);
});

test('isMaterialSubscriptionChange dedupes identical replay payloads', () => {
  const existing = { status: 'active', current_period_end: '2023-12-14T22:13:20.000Z' };
  assert.equal(isMaterialSubscriptionChange(existing, existing), false);
  assert.equal(
    isMaterialSubscriptionChange(existing, {
      status: 'past_due',
      current_period_end: '2023-12-14T22:13:20.000Z',
    }),
    true,
  );
});
