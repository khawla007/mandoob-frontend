import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

const root = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/payments');
const list = readFileSync(join(root, 'page.tsx'), 'utf8');
const detail = readFileSync(join(root, '[invoiceId]/page.tsx'), 'utf8');
const receipt = readFileSync(join(root, '[invoiceId]/receipt/route.ts'), 'utf8');
const action = readFileSync(join(root, 'actions.ts'), 'utf8');

test('every finance page, action, and receipt directly enters the linked-Company boundary', () => {
  for (const source of [list, detail, receipt]) {
    assert.match(source, /authorizeCustomerLinkedCompanyRead\(/u);
    assert.match(source, /kind !== 'authorized'|authorize: async \(\) => access/u);
  }
  assert.match(action, /requireAuthorizedCustomerLinkedCompanyRead\(/u);
});

test('payment action scopes and validates the invoice but keeps unsafe provider initiation closed', () => {
  for (const predicate of [
    ".eq('tenant_id', access.tenant.id)",
    ".eq('company_id', access.company.id)",
    ".eq('customer_profile_id', access.session.id)",
    ".eq('id', args.invoiceId)",
  ]) {
    const position = action.indexOf(predicate);
    assert.ok(position > 0, predicate);
  }
  assert.match(action, /validateCustomerInvoiceForPayment/u);
  assert.match(action, /code: 'PAYMENT_CONTRACT_UNAVAILABLE'/u);
  assert.doesNotMatch(
    action,
    /createCharge|resolveTenantTapConfig|\.from\('payments'\)|\.insert\(/u,
  );
});

test('receipt lookup includes the authoritative Company and remains non-disclosing', () => {
  assert.match(receipt, /access\.company\.id/u);
  assert.match(receipt, /if \(access\.kind !== 'authorized'\) notFound\(\)/u);
});

test('finance surfaces expose exact filters, mixed-currency separation, provider state, and no invented line items', () => {
  assert.match(list, /\['all', 'open', 'overdue', 'paid', 'cancelled'\]/u);
  assert.match(list, /totalsByCurrency/u);
  assert.match(detail, /paymentContractUnavailable/u);
  assert.match(detail, /lineItemsUnavailable/u);
  assert.doesNotMatch(list + detail, /provider_charge|customer_id|merchant_id|secret/u);
});

test('finance catalogs preserve recursive English and Arabic key parity', () => {
  const shape = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
      : typeof value;
  assert.deepEqual(shape(en.customer.financeWorkspace), shape(ar.customer.financeWorkspace));
});
