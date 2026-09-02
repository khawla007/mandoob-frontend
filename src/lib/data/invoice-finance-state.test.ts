import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingRefundableMinor, resolveInvoiceFinanceSections } from './invoice-finance-state';

test('remaining refundable minor units only subtract succeeded refunds in matching currency', () => {
  assert.equal(
    remainingRefundableMinor({
      currency: 'AED',
      payments: [
        { amountMinor: 1000, currency: 'AED', status: 'succeeded' },
        { amountMinor: 500, currency: 'AED', status: 'failed' },
      ],
      refunds: [
        { amountMinor: 250, currency: 'AED', status: 'succeeded' },
        { amountMinor: 750, currency: 'USD', status: 'succeeded' },
      ],
    }),
    750,
  );
  assert.equal(
    remainingRefundableMinor({
      currency: 'AED',
      payments: [{ amountMinor: 1000, currency: 'AED', status: 'succeeded' }],
      refunds: [{ amountMinor: 1000, currency: 'AED', status: 'succeeded' }],
    }),
    0,
  );
});

test('payment failure makes all refund-dependent sections unavailable', () => {
  assert.deepEqual(
    resolveInvoiceFinanceSections({
      payments: false,
      refunds: true,
      refundOperation: true,
      audit: true,
    }),
    {
      payments: 'unavailable',
      refunds: 'unavailable',
      refundOperation: 'unavailable',
      audit: 'available',
    },
  );
  assert.deepEqual(
    resolveInvoiceFinanceSections({
      payments: true,
      refunds: false,
      refundOperation: true,
      audit: true,
    }),
    {
      payments: 'available',
      refunds: 'unavailable',
      refundOperation: 'unavailable',
      audit: 'available',
    },
  );
});
