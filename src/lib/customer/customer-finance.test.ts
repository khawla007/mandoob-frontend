import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customerFinanceHref,
  customerInvoiceDueState,
  isCustomerInvoicePayable,
  normaliseCustomerInvoice,
  parseCustomerFinanceSearch,
  paymentAttemptState,
  totalsByCurrency,
} from './customer-finance';

test('finance search parsing is deterministic and rejects malformed input', () => {
  assert.deepEqual(parseCustomerFinanceSearch({ status: 'paid', page: '3' }), {
    status: 'paid',
    page: 3,
    invoice: null,
  });
  assert.deepEqual(parseCustomerFinanceSearch({ status: 'secret', page: '-4', invoice: 'nope' }), {
    status: 'all',
    page: 1,
    invoice: null,
  });
});

test('finance links encode tenant context and preserve supported filters', () => {
  assert.equal(
    customerFinanceHref('company name', { status: 'open', page: 2, invoice: null }),
    '/t/company%20name/portal/payments?status=open&page=2',
  );
});

test('invoice normalization preserves zero and rejects unsafe money or currency', () => {
  assert.equal(
    normaliseCustomerInvoice({
      id: 'invoice-1',
      tenant_id: 'tenant-1',
      company_id: 'company-1',
      customer_profile_id: 'profile-1',
      label: 'Government fee',
      amount_minor: 0,
      currency: 'AED',
      status: 'open',
      due_at: null,
      paid_at: null,
      created_at: '2026-09-01T00:00:00Z',
    })?.amountMinor,
    0,
  );
  assert.equal(normaliseCustomerInvoice({ amount_minor: -1, currency: 'AED' }), null);
  assert.equal(normaliseCustomerInvoice({ amount_minor: 1.25, currency: 'AED' }), null);
  assert.equal(normaliseCustomerInvoice({ amount_minor: 100, currency: 'USDX' }), null);
  assert.equal(
    normaliseCustomerInvoice({
      ...{
        id: 'invoice-1',
        label: 'Fee',
        amount_minor: 100,
        currency: 'AED',
        status: 'open',
        created_at: 'invalid',
        due_at: '2026-99-99',
      },
    }),
    null,
  );
});

test('due state uses Dubai business-date boundaries without changing invoice status', () => {
  assert.equal(customerInvoiceDueState('open', '2026-09-04', '2026-09-05'), 'overdue');
  assert.equal(customerInvoiceDueState('open', '2026-09-05', '2026-09-05'), 'due-today');
  assert.equal(customerInvoiceDueState('paid', '2026-09-04', '2026-09-05'), 'settled');
  assert.equal(customerInvoiceDueState('open', null, '2026-09-05'), 'missing');
  assert.equal(customerInvoiceDueState('open', '2026-99-99', '2026-09-05'), 'missing');
});

test('pay eligibility also requires an accepted initiation contract', () => {
  assert.equal(isCustomerInvoicePayable('open', 'configured'), false);
  assert.equal(isCustomerInvoicePayable('open', 'configured', 'available'), true);
  assert.equal(isCustomerInvoicePayable('open', 'unavailable', 'available'), false);
  assert.equal(isCustomerInvoicePayable('paid', 'configured', 'available'), false);
});

test('payment states distinguish success, pending, failure, cancellation, and expiry', () => {
  assert.equal(paymentAttemptState('succeeded'), 'success');
  assert.equal(paymentAttemptState('initiated'), 'pending');
  assert.equal(paymentAttemptState('failed'), 'declined');
  assert.equal(paymentAttemptState('abandoned'), 'cancelled');
  assert.equal(paymentAttemptState('expired'), 'expired');
  assert.equal(paymentAttemptState('voided'), 'cancelled');
  assert.equal(paymentAttemptState('mystery'), null);
});

test('currency totals remain separated and exclude non-open invoices', () => {
  assert.deepEqual(
    totalsByCurrency([
      { status: 'open', amountMinor: 0, currency: 'AED' },
      { status: 'open', amountMinor: 200, currency: 'USD' },
      { status: 'void', amountMinor: 999, currency: 'AED' },
    ]),
    [
      { currency: 'AED', amountMinor: 0 },
      { currency: 'USD', amountMinor: 200 },
    ],
  );
  assert.equal(
    totalsByCurrency([
      { status: 'open', amountMinor: Number.MAX_SAFE_INTEGER, currency: 'AED' },
      { status: 'open', amountMinor: 1, currency: 'AED' },
    ]),
    null,
  );
});
