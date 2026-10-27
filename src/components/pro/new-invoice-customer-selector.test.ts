import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dialog = readFileSync(new URL('./NewInvoiceDialog.tsx', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(pro)/payments/page.tsx', import.meta.url),
  'utf8',
);

test('new invoice UI requires an explicit customer from the bounded active option list', () => {
  assert.match(dialog, /customers:\s*InvoiceCustomerOption\[\]/u);
  assert.match(dialog, /<select[\s\S]*required[\s\S]*value=\{customerProfileId\}/u);
  assert.match(dialog, /customers\.map/u);
  assert.match(dialog, /customerProfileId,/u);
  assert.match(dialog, /customers\.length === 0[\s\S]*disabled/u);
  assert.match(page, /listActiveInvoiceCustomerOptions\(tenant\.id, company\.id\)/u);
  assert.match(page, /<NewInvoiceDialog[\s\S]*customers=\{customers\}/u);
});
