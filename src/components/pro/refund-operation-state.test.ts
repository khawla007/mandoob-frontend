import assert from 'node:assert/strict';
import test from 'node:test';

import { syncRefundOperationId } from './refund-operation-state';

test('external terminal reconciliation releases the pending UUID for a later partial refund', () => {
  const generated = ['operation-b'];
  const pendingId = syncRefundOperationId(null, {
    operationId: 'operation-a',
    status: 'pending',
  });
  assert.equal(pendingId, 'operation-a');

  const settledId = syncRefundOperationId(pendingId, {
    operationId: 'operation-a',
    status: 'succeeded',
  });
  assert.equal(settledId, null);

  const nextId = settledId ?? generated.shift()!;
  assert.equal(nextId, 'operation-b');
  assert.notEqual(nextId, pendingId);
});

test('an active pending operation remains stable for an explicit retry', () => {
  assert.equal(
    syncRefundOperationId('local-operation', {
      operationId: 'durable-operation',
      status: 'pending',
    }),
    'durable-operation',
  );
});
