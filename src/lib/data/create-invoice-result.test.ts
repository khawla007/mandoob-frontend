import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvoiceFailure } from './create-invoice-result';

test('invoice creation failures expose a stable safe message instead of database detail', () => {
  const result = createInvoiceFailure(new Error('relation invoices_secret does not exist'));
  assert.deepEqual(result, {
    ok: false,
    error: 'Could not create invoice',
    code: 'DB_INSERT_FAILED',
  });
  assert.doesNotMatch(result.error, /relation|secret|exist/i);
});
