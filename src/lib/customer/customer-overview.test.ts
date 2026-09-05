import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomerPortalHref,
  customerDeadlineUrgency,
  rankCustomerActions,
  settleCustomerWidgets,
  summarizeOpenInvoices,
} from './customer-overview';

test('independent Customer widgets preserve ready, empty, error, and unavailable states', async () => {
  const states = await settleCustomerWidgets({
    documents: Promise.resolve([1]),
    renewals: Promise.resolve([]),
    invoices: Promise.reject(new Error('raw provider error')),
    notifications: null,
  });
  assert.deepEqual(states, {
    documents: { kind: 'ready', value: [1] },
    renewals: { kind: 'empty', value: [] },
    invoices: { kind: 'error' },
    notifications: { kind: 'unavailable' },
  });
});

test('Dubai business-date urgency distinguishes missing, overdue, today, due soon, and future', () => {
  const now = new Date('2026-09-05T21:30:00.000Z'); // 2026-09-06 in Dubai
  assert.equal(customerDeadlineUrgency(null, now), 'missing');
  assert.equal(customerDeadlineUrgency('2026-09-05', now), 'overdue');
  assert.equal(customerDeadlineUrgency('2026-09-06', now), 'due-today');
  assert.equal(customerDeadlineUrgency('2026-10-06', now), 'due-soon');
  assert.equal(customerDeadlineUrgency('2026-10-07', now), 'future');
  assert.equal(customerDeadlineUrgency('not-a-date', now), 'missing');
});

test('open invoice summary never combines currencies and excludes non-open statuses', () => {
  assert.deepEqual(
    summarizeOpenInvoices([
      { id: 'z', status: 'open', amountMinor: 1250, currency: 'aed' },
      { id: 'a', status: 'open', amountMinor: 500, currency: 'USD' },
      { id: 'b', status: 'open', amountMinor: 750, currency: 'AED' },
      { id: 'c', status: 'paid', amountMinor: 9999, currency: 'AED' },
    ]),
    [
      { currency: 'AED', amountMinor: 2000, count: 2 },
      { currency: 'USD', amountMinor: 500, count: 1 },
    ],
  );
});

test('Customer action ranking is bounded, deterministic, and follows business priority', () => {
  const actions = rankCustomerActions(
    [
      { kind: 'invoice', id: 'invoice-b', href: '/invoice-b', dueDate: '2026-09-01' },
      { kind: 'renewal', id: 'renewal-soon', href: '/renewal-soon', dueDate: '2026-09-20' },
      { kind: 'document-request', id: 'doc-b', href: '/doc-b', dueDate: null },
      { kind: 'renewal', id: 'renewal-today', href: '/renewal-today', dueDate: '2026-09-06' },
      { kind: 'document-request', id: 'doc-a', href: '/doc-a', dueDate: '2026-09-10' },
      { kind: 'renewal', id: 'renewal-overdue', href: '/renewal-overdue', dueDate: '2026-09-05' },
      { kind: 'invoice', id: 'invoice-a', href: '/invoice-a', dueDate: '2026-09-01' },
    ],
    new Date('2026-09-05T21:30:00.000Z'),
    6,
  );
  assert.deepEqual(
    actions.map(({ id }) => id),
    ['doc-a', 'doc-b', 'renewal-overdue', 'renewal-today', 'renewal-soon', 'invoice-a'],
  );
});

test('exact Customer portal links encode tenant slugs, entity identifiers, and filters', () => {
  assert.equal(
    buildCustomerPortalHref('company / دبي', 'overview'),
    '/t/company%20%2F%20%D8%AF%D8%A8%D9%8A/portal',
  );
  assert.equal(
    buildCustomerPortalHref('company / دبي', 'documents', { requestId: 'request / 1' }),
    '/t/company%20%2F%20%D8%AF%D8%A8%D9%8A/portal/documents?requestId=request+%2F+1',
  );
  assert.equal(
    buildCustomerPortalHref('acme', 'renewals', { focus: 'renewal&1' }),
    '/t/acme/portal/renewals?focus=renewal%261',
  );
});
