import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canShowRefundAction,
  remainingRefundableMinor,
  resolveInvoiceFinanceSections,
} from './invoice-finance-state';

test('remaining refundable balance matches the refund RPC latest-payment and reservation rule', () => {
  assert.equal(
    remainingRefundableMinor({
      currency: 'AED',
      payments: [
        {
          id: 'old',
          amountMinor: 500,
          currency: 'AED',
          status: 'succeeded',
          createdAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'latest',
          amountMinor: 1000,
          currency: 'AED',
          status: 'partially_refunded',
          createdAt: '2026-09-02T00:00:00Z',
        },
      ],
      refunds: [
        { paymentId: 'old', amountMinor: 500, status: 'succeeded' },
        { paymentId: 'latest', amountMinor: 250, status: 'succeeded' },
        { paymentId: 'latest', amountMinor: 100, status: 'pending' },
        { paymentId: 'latest', amountMinor: 100, status: 'failed' },
      ],
    }),
    650,
  );
  assert.equal(
    remainingRefundableMinor({
      currency: 'AED',
      payments: [
        {
          id: 'p',
          amountMinor: 1000,
          currency: 'AED',
          status: 'succeeded',
          createdAt: '2026-09-02T00:00:00Z',
        },
      ],
      refunds: [{ paymentId: 'p', amountMinor: 1000, status: 'succeeded' }],
    }),
    0,
  );
  assert.equal(
    remainingRefundableMinor({
      currency: 'AED',
      payments: [
        {
          id: 'p',
          amountMinor: 1000,
          currency: 'USD',
          status: 'succeeded',
          createdAt: '2026-09-02T00:00:00Z',
        },
      ],
      refunds: [],
    }),
    null,
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

test('a pending durable refund remains retryable after it reserves the full balance', () => {
  assert.equal(
    canShowRefundAction({ detailsAvailable: true, remainingMinor: 0, hasPendingRefund: true }),
    true,
  );
  assert.equal(
    canShowRefundAction({ detailsAvailable: true, remainingMinor: 0, hasPendingRefund: false }),
    false,
  );
  assert.equal(
    canShowRefundAction({ detailsAvailable: false, remainingMinor: 100, hasPendingRefund: true }),
    false,
  );
});
