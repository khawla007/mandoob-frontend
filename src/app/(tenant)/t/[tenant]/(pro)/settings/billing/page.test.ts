import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const controls = readFileSync(
  new URL('../../../../../../../components/finance/SubscriptionControls.tsx', import.meta.url),
  'utf8',
);
const data = readFileSync(
  new URL('../../../../../../../lib/data/tenant-billing.ts', import.meta.url),
  'utf8',
);

test('billing page wires enabled authoritative catalog options to Stripe form actions', () => {
  assert.match(page, /getBillingManagementSnapshot/u);
  assert.match(page, /resolveStripeRuntimeConfig/u);
  assert.match(page, /startCheckoutFormAction/u);
  assert.match(page, /changeSubscriptionFormAction/u);
  assert.match(page, /openBillingPortalFormAction/u);
  assert.match(page, /cancelSubscriptionFormAction/u);
  assert.match(page, /subscriptionVersion=\{subscription\?\.version \?\? null\}/u);
  assert.doesNotMatch(page, /<Button[^>]+disabled/u);
});

test('management loader fails closed and returns no provider identifiers to the page', () => {
  assert.match(data, /subscription_provider_enablement/u);
  assert.match(data, /subscription_provider_price_mappings/u);
  assert.match(data, /stripe_customer_mappings/u);
  assert.match(data, /\.eq\('tenant_id', tenantId\)/u);
  assert.match(data, /catalog_class/u);
  assert.doesNotMatch(data, /provider_price_id/u);
  assert.doesNotMatch(controls, /providerPriceId|stripe_customer_id|stripe_subscription_id/u);
  assert.match(controls, /name="operationId"/u);
  assert.match(controls, /name="expectedVersion"/u);
  assert.match(controls, /name="catalogVersionId"/u);
});
