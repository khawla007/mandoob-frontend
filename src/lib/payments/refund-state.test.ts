import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canRefundPaymentStatus, resolveRefundLedgerState } from './refund-state';

test('canRefundPaymentStatus allows subsequent partial refunds', () => {
  assert.equal(canRefundPaymentStatus('succeeded'), true);
  assert.equal(canRefundPaymentStatus('partially_refunded'), true);
  assert.equal(canRefundPaymentStatus('refunded'), false);
});

test('resolveRefundLedgerState keeps pending provider refunds out of paid receipt state', () => {
  const state = resolveRefundLedgerState({
    refundStatus: 'pending',
    amountMinor: 500,
    remainingMinor: 500,
  });

  assert.equal(state.settlesImmediately, false);
  assert.equal(state.invoiceStatus, null);
  assert.equal(state.paymentStatus, null);
});

test('resolveRefundLedgerState marks full and partial successful refunds', () => {
  assert.deepEqual(
    resolveRefundLedgerState({ refundStatus: 'succeeded', amountMinor: 300, remainingMinor: 500 }),
    {
      settlesImmediately: true,
      isFull: false,
      invoiceStatus: 'partially_refunded',
      paymentStatus: 'partially_refunded',
    },
  );
  assert.deepEqual(
    resolveRefundLedgerState({ refundStatus: 'succeeded', amountMinor: 500, remainingMinor: 500 }),
    {
      settlesImmediately: true,
      isFull: true,
      invoiceStatus: 'refunded',
      paymentStatus: 'refunded',
    },
  );
});
