import assert from 'node:assert/strict';
import test from 'node:test';
import { safeImportErrorCode, safeImportField, safeImportJobStatus } from './import-job-display';

test('import job display maps only approved operational values and hides unknown raw values', () => {
  assert.equal(safeImportJobStatus('completed'), 'completed');
  assert.equal(safeImportJobStatus('private_future_status'), 'unknown');
  assert.equal(safeImportErrorCode('INSERT_FAILED'), 'INSERT_FAILED');
  assert.equal(safeImportErrorCode('private provider detail'), 'UNKNOWN');
  assert.equal(safeImportField('passport_no'), 'passport_no');
  assert.equal(safeImportField('private_column'), 'unknown');
});
