import assert from 'node:assert/strict';
import test from 'node:test';
import { isImportJobCancellable } from './import-job-scope';

test('cancellation is offered before execution and once while importing', () => {
  for (const status of ['uploaded', 'validating', 'validated']) {
    assert.equal(isImportJobCancellable(status), true, status);
  }
  assert.equal(isImportJobCancellable('importing'), true);
  assert.equal(isImportJobCancellable('importing', true), false);
  for (const status of ['completed', 'failed', 'cancelled', 'unknown']) {
    assert.equal(isImportJobCancellable(status), false, status);
  }
});
