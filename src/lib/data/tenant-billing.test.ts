import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingCancellationState,
  toBillingSubscriptionSnapshot,
  type BillingSubscription,
} from './billing-subscription';

const row = (status: string, overrides: Record<string, unknown> = {}) => ({
  plan: 'source-plan',
  status,
  current_period_end: '2026-12-01T00:00:00.000Z',
  cancel_at_period_end: false,
  canceled_at: null,
  unit_amount_minor: 9900,
  currency: 'AED',
  interval: 'month',
  ...overrides,
});

test('billing loader preserves every supported provider status as source-backed data', () => {
  for (const status of [
    'active',
    'trialing',
    'past_due',
    'incomplete',
    'incomplete_expired',
    'paused',
    'unpaid',
    'canceled',
    'cancelled',
  ]) {
    const snapshot = toBillingSubscriptionSnapshot({ data: row(status), error: null });
    assert.equal(snapshot.status, 'ready', status);
    assert.equal(snapshot.status === 'ready' && snapshot.data?.status, status);
  }
});

test('billing loader reports unavailable only when the live source fails', () => {
  assert.deepEqual(toBillingSubscriptionSnapshot({ data: null, error: { message: 'db' } }), {
    status: 'unavailable',
  });
  assert.deepEqual(toBillingSubscriptionSnapshot({ data: null, error: null }), {
    status: 'ready',
    data: null,
  });
});

test('actual cancellation beats a scheduled cancellation flag', () => {
  const subscription = (overrides: Partial<BillingSubscription>): BillingSubscription => ({
    plan: 'source-plan',
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: true,
    canceledAt: null,
    unitAmountMinor: 0,
    currency: 'AED',
    interval: 'month',
    ...overrides,
  });
  assert.equal(billingCancellationState(subscription({ status: 'canceled' })), 'cancelled');
  assert.equal(
    billingCancellationState(subscription({ canceledAt: '2026-01-01T00:00:00.000Z' })),
    'cancelled',
  );
  assert.equal(billingCancellationState(subscription({})), 'scheduled');
});
