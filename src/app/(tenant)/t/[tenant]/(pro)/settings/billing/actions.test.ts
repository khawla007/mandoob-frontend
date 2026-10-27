import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');

test('billing effects require tenant/company/AAL2 authority and durable reservation', () => {
  assert.match(source, /requireProTenantRouteAccess/u);
  assert.match(source, /enforcePrivilegedSession/u);
  assert.match(source, /readAssignedCompanyForPro/u);
  assert.match(source, /p309_reserve_stripe_operation/u);
  assert.ok(source.indexOf('reserve: async') < source.indexOf('create: async'));
  assert.ok(
    source.indexOf('p309_reserve_stripe_operation') < source.lastIndexOf('createCheckoutSession'),
  );
});
test('checkout, portal, scheduled change and cancel use authoritative records', () => {
  assert.match(source, /stripe_customer_mappings/u);
  assert.match(source, /subscriptions/u);
  assert.match(source, /createCheckoutSession/u);
  assert.match(source, /createBillingPortalSession/u);
  assert.match(source, /scheduleSubscriptionChange/u);
  assert.match(source, /expectedVersion/u);
  assert.doesNotMatch(source, /STRIPE_PRICE_/u);
});

test('provider redirects are allowlisted before persistence and again before navigation', () => {
  assert.match(source, /normalizeStripeRedirectUrl/u);
  assert.match(source, /effect\.url\s*\?\s*normalizeStripeRedirectUrl/u);
  assert.match(source, /normalizeStripeRedirectUrl\(result\.redirectUrl\)/u);
});
