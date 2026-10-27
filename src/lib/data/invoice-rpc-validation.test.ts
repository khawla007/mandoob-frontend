import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInvoiceRpcWindow } from './invoice-rpc-validation';

test('company invoice RPC rejects malformed success payload instead of returning empty zero', () => {
  for (const payload of [null, {}, { rows: [], total: '0' }, { rows: 'no', total: 0 }]) {
    assert.throws(() => parseInvoiceRpcWindow(payload), /INVOICE_SOURCE_UNAVAILABLE/u);
  }
});
