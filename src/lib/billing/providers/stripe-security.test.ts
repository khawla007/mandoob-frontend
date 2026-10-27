import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStripeRedirectUrl } from '../stripe-redirect';

test('accepts only exact Stripe Checkout and Billing Portal HTTPS hosts', () => {
  assert.equal(
    normalizeStripeRedirectUrl('https://checkout.stripe.com/c/pay/cs_test'),
    'https://checkout.stripe.com/c/pay/cs_test',
  );
  assert.equal(
    normalizeStripeRedirectUrl('https://billing.stripe.com/p/session/test'),
    'https://billing.stripe.com/p/session/test',
  );
  for (const value of [
    'http://checkout.stripe.com/c/pay/cs_test',
    'https://checkout.stripe.com.evil.test/c/pay/cs_test',
    'https://evil.test/?next=https://checkout.stripe.com',
    'https://user@checkout.stripe.com/c/pay/cs_test',
    'https://checkout.stripe.com:444/c/pay/cs_test',
    'javascript:alert(1)',
  ]) {
    assert.equal(normalizeStripeRedirectUrl(value), null, value);
  }
});
