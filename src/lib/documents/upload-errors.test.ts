import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadErrorMessage } from './upload-errors';

test('uploadErrorMessage gives scanner outages a retry-focused message', () => {
  assert.equal(
    uploadErrorMessage('SCANNER_UNAVAILABLE', 'Virus scanner is temporarily unavailable.'),
    'SCANNER_UNAVAILABLE: Security scanning is temporarily unavailable. Try again in a few minutes.',
  );
});

test('uploadErrorMessage preserves existing code and error display for other failures', () => {
  assert.equal(
    uploadErrorMessage('FILE_REJECTED_BY_SCAN', 'file failed virus scan'),
    'FILE_REJECTED_BY_SCAN: file failed virus scan',
  );
});
