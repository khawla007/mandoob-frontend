import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCustomerInvoiceForPayment } from './customer-payment-action';

const scope = { tenantId: 't1', companyId: 'c1', profileId: 'p1', invoiceId: 'i1' };
const invoice = {
  id: 'i1',
  tenant_id: 't1',
  company_id: 'c1',
  customer_profile_id: 'p1',
  label: 'Fee',
  amount_minor: 100,
  currency: 'AED',
  status: 'open',
  due_at: null,
  paid_at: null,
  created_at: '2026-09-01T00:00:00Z',
};

function code(result: ReturnType<typeof validateCustomerInvoiceForPayment>) {
  assert.equal(result.ok, false);
  return result.ok ? null : result.code;
}

test('payment validation fails closed for source, ownership, status, and unsafe money', () => {
  assert.equal(validateCustomerInvoiceForPayment(invoice, scope).ok, true);
  assert.equal(
    code(validateCustomerInvoiceForPayment(invoice, scope, new Error('private'))),
    'PAYMENT_STATE_ERROR',
  );
  assert.equal(
    code(validateCustomerInvoiceForPayment({ ...invoice, company_id: 'other' }, scope)),
    'NOT_FOUND',
  );
  assert.equal(
    code(validateCustomerInvoiceForPayment({ ...invoice, status: 'paid' }, scope)),
    'INVALID_STATE',
  );
  assert.equal(
    code(
      validateCustomerInvoiceForPayment(
        { ...invoice, amount_minor: Number.MAX_SAFE_INTEGER + 1 },
        scope,
      ),
    ),
    'INVALID_STATE',
  );
  assert.equal(
    code(validateCustomerInvoiceForPayment({ ...invoice, currency: 'USDX' }, scope)),
    'INVALID_STATE',
  );
});
