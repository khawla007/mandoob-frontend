import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomerInvoiceOverview,
  buildCustomerPortalHref,
  composeCustomerActions,
  customerDeadlineUrgency,
  rankCustomerActions,
  settleCustomerWidgets,
  summarizeCustomerDocuments,
  summarizeCustomerRequests,
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

test('submitted-document failure does not erase ready requested-document state', async () => {
  const widgets = await settleCustomerWidgets({
    documentRequests: Promise.resolve([{ id: 'request-1' }]),
    documents: Promise.reject(new Error('documents unavailable')),
  });

  assert.deepEqual(widgets.documentRequests, { kind: 'ready', value: [{ id: 'request-1' }] });
  assert.deepEqual(widgets.documents, { kind: 'error' });
});

test('requested-document failure does not erase ready submitted-document state', async () => {
  const widgets = await settleCustomerWidgets({
    documentRequests: Promise.reject(new Error('requests unavailable')),
    documents: Promise.resolve([{ id: 'document-1', reviewStatus: 'submitted' }]),
  });

  assert.deepEqual(widgets.documentRequests, { kind: 'error' });
  assert.deepEqual(widgets.documents, {
    kind: 'ready',
    value: [{ id: 'document-1', reviewStatus: 'submitted' }],
  });
});

test('seven requests and zero documents retain independent bounds without false submitted suffix', () => {
  const requests = summarizeCustomerRequests(
    Array.from({ length: 7 }, (_, index) => ({ id: `request-${index}` })),
    6,
  );
  const documents = summarizeCustomerDocuments([], 6);

  assert.deepEqual(requests.count, { value: 6, completeness: 'at-least' });
  assert.deepEqual(documents.submitted, { value: 0, completeness: 'exact' });
  assert.deepEqual(documents.reviewed, { value: 0, completeness: 'exact' });
  assert.deepEqual(documents.rejected, { value: 0, completeness: 'exact' });
});

test('seven submitted documents expose their own lower bounds and reviewed/rejected mix', () => {
  const documents = summarizeCustomerDocuments(
    ['approved', 'rejected', 'submitted', 'approved', 'rejected', 'submitted', 'approved'].map(
      (reviewStatus, index) => ({ id: `document-${index}`, reviewStatus }),
    ),
    6,
  );

  assert.deepEqual(documents.submitted, { value: 6, completeness: 'at-least' });
  assert.deepEqual(documents.reviewed, { value: 4, completeness: 'at-least' });
  assert.deepEqual(documents.rejected, { value: 2, completeness: 'at-least' });
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
      {
        kind: 'invoice',
        id: 'invoice-b',
        href: '/payments',
        dueDate: '2026-09-05',
        actionable: true,
        status: 'open',
      },
      {
        kind: 'renewal',
        id: 'renewal-soon',
        href: '/renewals',
        dueDate: '2026-09-20',
        actionable: true,
        status: 'due_soon',
      },
      {
        kind: 'document-request',
        id: 'doc-undated',
        href: '/documents',
        dueDate: null,
        actionable: true,
        status: 'pending',
      },
      {
        kind: 'renewal',
        id: 'renewal-today',
        href: '/renewals',
        dueDate: '2026-09-06',
        actionable: true,
        status: 'upcoming',
      },
      {
        kind: 'document-request',
        id: 'doc-soon',
        href: '/documents',
        dueDate: '2026-09-10',
        actionable: true,
        status: 'pending',
      },
      {
        kind: 'renewal',
        id: 'renewal-completed',
        href: '/renewals',
        dueDate: '2026-09-01',
        actionable: true,
        status: 'completed',
      },
      {
        kind: 'renewal',
        id: 'renewal-cancelled',
        href: '/renewals',
        dueDate: '2026-09-01',
        actionable: true,
        status: 'cancelled',
      },
      {
        kind: 'invoice',
        id: 'invoice-paid',
        href: '/payments',
        dueDate: '2026-09-01',
        actionable: false,
        status: 'paid',
      },
      {
        kind: 'document-request',
        id: 'doc-overdue',
        href: '/documents',
        dueDate: '2026-09-04',
        actionable: true,
        status: 'pending',
      },
    ],
    new Date('2026-09-05T21:30:00.000Z'),
    6,
  );
  assert.deepEqual(
    actions.map(({ id }) => id),
    ['doc-overdue', 'invoice-b', 'renewal-today', 'doc-soon', 'renewal-soon', 'doc-undated'],
  );
});

test('Customer portal links encode tenant slugs and only expose implemented generic routes', () => {
  assert.equal(
    buildCustomerPortalHref('company / دبي', 'overview'),
    '/t/company%20%2F%20%D8%AF%D8%A8%D9%8A/portal',
  );
  assert.equal(
    buildCustomerPortalHref('company / دبي', 'documents'),
    '/t/company%20%2F%20%D8%AF%D8%A8%D9%8A/portal/documents',
  );
  assert.equal(buildCustomerPortalHref('acme', 'renewals'), '/t/acme/portal/renewals');
});

test('composed actions preserve source error and unavailable truth instead of false empty', () => {
  assert.deepEqual(
    composeCustomerActions({
      documents: { kind: 'error' },
      renewals: { kind: 'empty', value: [] },
      invoices: { kind: 'ready', value: [] },
    }),
    { kind: 'error' },
  );
  assert.deepEqual(
    composeCustomerActions({
      documents: { kind: 'ready', value: [] },
      renewals: { kind: 'unavailable' },
      invoices: { kind: 'ready', value: [] },
    }),
    { kind: 'unavailable' },
  );
});

test('composed actions keep actionable siblings while exposing a partial source failure', () => {
  assert.deepEqual(
    composeCustomerActions(
      {
        documents: { kind: 'error' },
        renewals: {
          kind: 'ready',
          value: [
            {
              kind: 'renewal',
              id: 'renewal-1',
              href: '/t/acme/portal/renewals',
              dueDate: '2026-03-09',
              actionable: true,
              status: 'pending',
            },
          ],
        },
        invoices: { kind: 'unavailable' },
      },
      new Date('2026-03-10T08:00:00+04:00'),
    ),
    {
      kind: 'partial',
      value: [
        {
          kind: 'renewal',
          id: 'renewal-1',
          href: '/t/acme/portal/renewals',
          dueDate: '2026-03-09',
          actionable: true,
          status: 'pending',
        },
      ],
      sourceState: 'error',
    },
  );
});

test('more than 100 open invoices keeps exact count but makes currency totals unavailable', () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: `invoice-${index}`,
    label: `Invoice ${index}`,
    amountMinor: 100,
    currency: index % 2 ? 'AED' : 'USD',
    status: 'open',
    dueDate: null,
  }));
  const result = buildCustomerInvoiceOverview(101, rows, rows.slice(0, 10));
  assert.equal(result.openCount, 101);
  assert.equal(result.totals.kind, 'unavailable');
  assert.equal(result.recent.length, 10);
  assert.equal(result.recentIsBounded, true);
});
