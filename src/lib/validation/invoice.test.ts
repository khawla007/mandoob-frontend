import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoiceActionSchema, refundInvoiceActionSchema } from './invoice';

test('createInvoiceActionSchema converts AED major units to minor units', () => {
  const parsed = createInvoiceActionSchema.parse({
    clientId: '11111111-1111-4111-8111-111111111111',
    label: 'Trade license renewal',
    amount: '1250.75',
    dueAt: '2026-06-30',
  });

  assert.equal(parsed.amountMinor, 125075);
  assert.equal(parsed.currency, 'AED');
});

test('createInvoiceActionSchema rejects amounts with more than two decimals', () => {
  assert.throws(
    () =>
      createInvoiceActionSchema.parse({
        clientId: '11111111-1111-4111-8111-111111111111',
        label: 'Trade license renewal',
        amount: '12.345',
      }),
    /Amount must use at most two decimals/,
  );
});

test('refundInvoiceActionSchema rejects empty reasons and non-positive amounts', () => {
  assert.throws(
    () =>
      refundInvoiceActionSchema.parse({
        invoiceId: '22222222-2222-4222-8222-222222222222',
        amountMinor: 0,
        reason: 'x',
      }),
    /Too small/,
  );
});
