import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  beginBatchRequest,
  changeBatchRequest,
  completeBatchRequest,
  createBatchRequestState,
} from './batch-request-state';

test('batch retry retains one operation ID until payload changes or succeeds', () => {
  const initial = createBatchRequestState();
  const first = beginBatchRequest(initial, '11111111-1111-4111-8111-111111111111');
  const retry = beginBatchRequest(first, '22222222-2222-4222-8222-222222222222');
  assert.equal(retry.operationId, first.operationId);
  assert.equal(changeBatchRequest(retry).operationId, null);
  assert.equal(completeBatchRequest(retry).operationId, null);
});
