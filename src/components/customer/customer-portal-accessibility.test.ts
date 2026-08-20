import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(customer)/layout.tsx', import.meta.url),
  'utf8',
);
const paymentHistory = readFileSync(new URL('./PaymentHistoryCard.tsx', import.meta.url), 'utf8');

test('customer portal content is contained by one main landmark', () => {
  assert.match(layout, /<main id="main-content">\{children\}<\/main>/u);
});

test('payment subsection headings follow the portal page heading', () => {
  assert.doesNotMatch(paymentHistory, /<h3/u);
  assert.equal(paymentHistory.match(/<h2/gu)?.length, 2);
});
