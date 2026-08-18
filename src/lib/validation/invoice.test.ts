import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvoiceActionSchema, refundInvoiceActionSchema } from './invoice';

test('createInvoiceActionSchema converts AED major units to minor units', () => {
  const parsed = createInvoiceActionSchema.parse({
    label: 'Trade license renewal',
    amount: '1250.75',
    dueAt: '2026-06-30',
  });

  assert.equal(parsed.amountMinor, 125075);
  assert.equal(parsed.currency, 'AED');
  assert.equal('companyId' in parsed, false);
});

test('createInvoiceActionSchema rejects amounts with more than two decimals', () => {
  assert.throws(
    () =>
      createInvoiceActionSchema.parse({
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

test('refund operation requires a per-submission UUID that can be replayed unchanged', () => {
  const operationId = '77777777-7777-4777-8777-777777777777';
  const parsed = refundInvoiceActionSchema.parse({
    invoiceId: '22222222-2222-4222-8222-222222222222',
    amountMinor: 500,
    reason: 'Duplicate charge',
    operationId,
  });
  assert.equal(parsed.operationId, operationId);
  assert.throws(() => refundInvoiceActionSchema.parse({ ...parsed, operationId: 'not-a-uuid' }));
});
