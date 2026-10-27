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

test('payment action scopes the invoice and exposes no provider plaintext', () => {
  for (const predicate of [
    'tenantId: access.tenant.id',
    'companyId: access.company.id',
    'customerProfileId: access.session.id',
    'invoiceId: args.invoiceId',
  ]) {
    const position = action.indexOf(predicate);
    assert.ok(position > 0, predicate);
  }
  assert.match(action, /loadCustomerInvoiceForPayment/u);
  assert.match(action, /code: 'PROVIDER_DISABLED'/u);
  assert.match(action, /runTapCharge/u);
  assert.doesNotMatch(action, /TAP_SECRET|sk_live|secretKey\s*[:=]|provider_event_payload/u);
});

test('payment return state is verified against route invoice and operation before rendering', () => {
  assert.match(detail, /verifyPaymentReturnState/u);
  assert.match(detail, /invoiceId/u);
  assert.match(detail, /operationId: query\.operation/u);
  assert.match(detail, /if \(!validReturn\) notFound\(\)/u);
});

test('invoice detail exposes the reachable provider action only for configured collectible open invoices', () => {
  assert.match(detail, /import \{ PayButton \}/u);
  assert.match(detail, /isCustomerInvoicePayable\(/u);
  assert.match(detail, /invoice\.status/u);
  assert.match(detail, /detail\.provider/u);
  assert.match(detail, /invoice\.amountMinor > 0/u);
  assert.match(detail, /expectedVersion=\{invoice\.version\}/u);
  assert.match(detail, /!onlinePayable/u);
  assert.match(detail, /t\('detail\.providerUnavailable'\)/u);
});

test('receipt lookup includes the authoritative Company and remains non-disclosing', () => {
  assert.match(receipt, /access\.company\.id/u);
  assert.match(receipt, /if \(access\.kind !== 'authorized'\) notFound\(\)/u);
  const authorized = receipt.indexOf("access.kind !== 'authorized'");
  const selected = receipt.lastIndexOf('parseReceiptSelection');
  const loaded = receipt.lastIndexOf('loadAuthoritativeReceipt');
  assert.ok(authorized >= 0 && authorized < selected && selected < loaded);
  assert.match(receipt, /actorRole: 'customer'/u);
  assert.match(receipt, /receiptDownloadHeaders/u);
  assert.doesNotMatch(receipt, /getReceiptPayloadForCustomer/u);
});

test('receipt links require immutable snapshot availability, never settled status', () => {
  assert.match(detail, /invoice\.receiptAvailable/u);
  assert.match(detail, /detail\.receiptUnavailable/u);
  assert.doesNotMatch(detail, /isReceiptEligible/u);
});

test('finance surfaces expose exact filters, mixed-currency separation, provider state, and no invented line items', () => {
  assert.match(list, /\['all', 'open', 'overdue', 'paid', 'cancelled'\]/u);
  assert.match(list, /totalsByCurrency/u);
  assert.match(detail, /providerUnavailable/u);
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
