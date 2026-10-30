import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/payments/actions.ts'),
  'utf8',
);

test('customer payment input remains reference-only and authorization derives ownership', () => {
  assert.match(source, /requireAuthorizedCustomerLinkedCompanyRead\(args\.tenantSlug\)/u);
  assert.match(source, /invoiceId:\s*string/u);
  assert.match(source, /expectedVersion:\s*number/u);
  assert.match(source, /operationId:\s*string/u);
  assert.doesNotMatch(source, /companyId:\s*string/u);
  assert.doesNotMatch(source, /customerProfileId:\s*string/u);
  assert.match(source, /access\.tenant\.id/u);
  assert.match(source, /access\.company\.id/u);
  assert.match(source, /access\.session\.id/u);
});

test('customer action uses the scoped repository read and returns only safe codes', () => {
  assert.match(source, /loadCustomerInvoiceForPayment/u);
  assert.match(source, /sanitizeFinanceError/u);
  assert.doesNotMatch(source, /error\.message/u);
  assert.doesNotMatch(source, /\.from\('invoices'\)/u);
});

test('customer action runs the durable Tap coordinator and never returns provider diagnostics', () => {
  assert.match(source, /runTapCharge/u);
  assert.match(source, /consumeSensitiveRateLimit/u);
  assert.match(source, /RATE_LIMITED/u);
  assert.match(source, /merchantId !== destination\.account_id/u);
  assert.match(source, /p309_reserve_payment_attempt/u);
  assert.match(source, /createCharge/u);
  assert.match(source, /lookupChargeByEffectKey/u);
  assert.match(source, /webhooks\/tap\?destination=/u);
  assert.match(source, /p309_attach_payment_attempt/u);
  assert.match(source, /p_effect_token/u);
  assert.match(source, /p309_reconcile_payment_attempt/u);
  assert.match(source, /amountMinor:\s*intent\.amountMinor/u);
  assert.match(source, /currency:\s*intent\.currency/u);
  assert.doesNotMatch(source, /createCharge\(\{[\s\S]*?amountMinor,\s*currency,/u);
  assert.match(source, /PROVIDER_DISABLED/u);
  assert.doesNotMatch(source, /result\.error|error\.message|secretKey/u);
});
