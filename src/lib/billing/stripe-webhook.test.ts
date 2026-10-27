import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  handleVerifiedStripeEvent,
  normalizeAuthoritativeSubscription,
  type StripeSubscriptionInput,
} from './stripe-webhook';

const subscription = (): StripeSubscriptionInput => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  metadata: { tenant_id: crypto.randomUUID() },
  items: {
    data: [
      {
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_592_000,
        price: {
          id: 'price_exact',
          unit_amount: 19_900,
          currency: 'aed',
          recurring: { interval: 'month' },
        },
      },
    ],
  },
});

test('normalization carries provider facts but never derives a plan', () => {
  const value = normalizeAuthoritativeSubscription(subscription());
  assert.equal(value.priceId, 'price_exact');
  assert.equal(value.currency, 'AED');
  assert.equal('plan' in value, false);
});

test('duplicate webhook stops after durable reservation', async () => {
  let apply = 0;
  const result = await handleVerifiedStripeEvent(
    {
      id: 'evt_1',
      created: 10,
      type: 'customer.subscription.updated',
      data: { object: subscription() },
    },
    '{}',
    {
      destination: 'test',
      reserve: async () => ({ eventId: crypto.randomUUID(), state: 'applied' }),
      bindCustomer: async () => {},
      retrieveSubscription: async () => subscription(),
      apply: async () => {
        apply += 1;
        return { state: 'applied' };
      },
    },
  );
  assert.equal(result.state, 'applied');
  assert.equal(apply, 0);
});

test('checkout reserves event then binds customer through operation before apply', async () => {
  const calls: string[] = [];
  await handleVerifiedStripeEvent(
    {
      id: 'evt_checkout',
      created: 11,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: crypto.randomUUID(),
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    },
    '{}',
    {
      destination: 'test',
      bindCustomer: async () => {
        calls.push('bind');
      },
      retrieveSubscription: async () => {
        calls.push('retrieve');
        return subscription();
      },
      reserve: async () => {
        calls.push('reserve');
        return { eventId: crypto.randomUUID(), state: 'reserved' };
      },
      apply: async () => {
        calls.push('apply');
        return { state: 'applied' };
      },
    },
  );
  assert.deepEqual(calls, ['reserve', 'bind', 'retrieve', 'apply']);
});
