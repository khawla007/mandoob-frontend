import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileTerminalTapRefundFailure } from './refund-effect-failure';

test('terminal provider rejection reconciles the fenced refund without a provider reference', async () => {
  const calls: unknown[] = [];
  const result = await reconcileTerminalTapRefundFailure(false, async (input) => {
    calls.push(input);
  });
  assert.equal(result, 'failed');
  assert.deepEqual(calls, [{ providerRefundId: null, status: 'failed' }]);
});

test('retryable provider failure remains pending and preserves the claim for lookup recovery', async () => {
  let reconciled = 0;
  const result = await reconcileTerminalTapRefundFailure(true, async () => {
    reconciled += 1;
  });
  assert.equal(result, 'pending');
  assert.equal(reconciled, 0);
});
