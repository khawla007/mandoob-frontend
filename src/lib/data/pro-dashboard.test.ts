import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseApplicationFilters } from '@/app/(tenant)/t/[tenant]/(pro)/applications/page-logic';
import { parseRenewalSearch } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/page-logic';
import { parseClientDetailSearch } from '@/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/page-logic';
import {
  associateCurrentDocumentVersions,
  calculateProDashboard,
  collectProDashboardPages,
  loadReferencedDocumentVersions,
  loadProDashboardRows,
  ProDashboardQueryError,
  settleProDashboardSources,
  type ProDashboardInput,
} from './pro-dashboard';

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TENANT = 'tenant-a';

function baseInput(): ProDashboardInput {
  return {
    tenantId: TENANT,
    tenantSlug: 'acme',
    days: 7,
    clients: [
      { id: 'client-1', tenant_id: TENANT, company_name: 'Acme', status: 'active' },
      { id: 'client-2', tenant_id: TENANT, company_name: 'Beacon', status: 'active' },
      { id: 'client-3', tenant_id: TENANT, company_name: 'Dormant', status: 'suspended' },
      { id: 'client-x', tenant_id: 'tenant-b', company_name: 'Intruder', status: 'active' },
    ],
    profiles: [
      { id: 'pro-1', tenant_id: TENANT, full_name: 'Aisha', role: 'pro', status: 'active' },
      {
        id: 'pro-x',
        tenant_id: 'tenant-b',
        full_name: 'Other tenant',
        role: 'pro',
        status: 'active',
      },
    ],
    serviceCases: [
      caseRow({
        id: 'case-first-open',
        client_id: 'client-1',
        assigned_to: 'pro-1',
        created_at: '2026-08-05T00:00:00.000Z',
        sla_due_at: '2026-08-10T10:00:00.000Z',
      }),
      caseRow({ id: 'case-2', client_id: 'client-1', assigned_to: 'pro-1' }),
      caseRow({ id: 'case-3', client_id: 'client-2', assigned_to: 'pro-1' }),
      caseRow({
        id: 'case-first-complete',
        client_id: 'client-2',
        status: 'completed',
        created_at: '2026-08-05T18:00:00.000Z',
        completed_at: '2026-08-05T19:59:59.000Z',
        sla_due_at: '2026-08-06T00:00:00.000Z',
      }),
      caseRow({ id: 'case-x', tenant_id: 'tenant-b', client_id: 'client-x', assigned_to: 'pro-x' }),
    ],
    renewals: [
      renewalRow({
        id: 'renewal-license',
        client_id: 'client-1',
        type: 'license',
        due_date: '2026-08-10',
        status: 'overdue',
      }),
      renewalRow({
        id: 'renewal-visa',
        client_id: 'client-2',
        type: 'visa',
        due_date: '2026-08-31',
      }),
      renewalRow({ id: 'renewal-x', tenant_id: 'tenant-b', client_id: 'client-x' }),
    ],
    documentRequests: [
      {
        id: 'request-1',
        tenant_id: TENANT,
        client_id: 'client-1',
        label: 'Passport copy',
        status: 'pending',
        due_at: '2026-08-10T10:00:00.000Z',
      },
      {
        id: 'request-x',
        tenant_id: 'tenant-b',
        client_id: 'client-x',
        label: 'Foreign document',
        status: 'pending',
        due_at: '2026-08-09T10:00:00.000Z',
      },
    ],
    documents: [
      {
        id: 'document-1',
        tenant_id: TENANT,
        client_id: 'client-2',
        label: 'License scan',
        currentVersion: { tenant_id: TENANT, review_status: 'pending' },
      },
    ],
    invoices: [
      invoiceRow({
        id: 'invoice-overdue',
        client_id: 'client-1',
        amount_minor: 7300,
        due_at: '2026-08-10',
      }),
      invoiceRow({
        id: 'invoice-soon',
        client_id: 'client-2',
        amount_minor: 2700,
        due_at: '2026-08-20',
      }),
      invoiceRow({
        id: 'invoice-usd',
        client_id: 'client-1',
        amount_minor: 999999,
        currency: 'USD',
      }),
      invoiceRow({
        id: 'invoice-x',
        tenant_id: 'tenant-b',
        client_id: 'client-x',
        amount_minor: 888888,
      }),
    ],
    payments: [
      paymentRow({ id: 'payment-1', invoice_id: 'invoice-overdue', amount_minor: 10000 }),
      paymentRow({
        id: 'payment-usd',
        invoice_id: 'invoice-usd',
        amount_minor: 999999,
        currency: 'USD',
      }),
      paymentRow({
        id: 'payment-x',
        tenant_id: 'tenant-b',
        invoice_id: 'invoice-x',
        amount_minor: 888888,
      }),
    ],
    refunds: [
      {
        id: 'refund-1',
        tenant_id: TENANT,
        payment_id: 'payment-1',
        amount_minor: 1000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-08-10T00:00:00.000Z',
      },
      {
        id: 'refund-x',
        tenant_id: 'tenant-b',
        payment_id: 'payment-x',
        amount_minor: 888888,
        status: 'succeeded',
        reason: null,
        created_at: '2026-08-10T00:00:00.000Z',
      },
    ],
  };
}

test('aggregates the tenant-scoped PRO operations contract', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);

  assert.equal(dashboard.generatedAt, NOW.toISOString());
  assert.equal(dashboard.kpis.activeClients, 2);
  assert.equal(dashboard.kpis.openCases, 3);
  assert.equal(dashboard.kpis.unassignedCases, 0);
  assert.equal(dashboard.kpis.renewalsDue30d, 2);
  assert.equal(dashboard.finance.overdueMinor, 7300);
  assert.deepEqual(
    dashboard.actionDeck.map((action) => action.kind),
    ['case', 'renewal', 'document', 'invoice'],
  );
  assert.deepEqual(dashboard.caseVelocity[0], { date: '2026-08-05', opened: 2, completed: 1 });
  assert.equal(dashboard.renewalStreams.license.d7, 1);
  assert.ok(Object.values(dashboard.health).every((value) => value >= 0 && value <= 100));
  assert.deepEqual(
    dashboard.team.map((member) => member.profileId),
    ['pro-1'],
  );
});

test('returns zero-filled chart dates and empty collections for empty input', () => {
  const empty = baseInput();
  for (const key of [
    'clients',
    'profiles',
    'serviceCases',
    'renewals',
    'documentRequests',
    'documents',
    'invoices',
    'payments',
    'refunds',
  ] as const) {
    empty[key] = [] as never;
  }

  const dashboard = calculateProDashboard(empty, NOW);
  assert.deepEqual(dashboard.caseVelocity, [
    { date: '2026-08-05', opened: 0, completed: 0 },
    { date: '2026-08-06', opened: 0, completed: 0 },
    { date: '2026-08-07', opened: 0, completed: 0 },
    { date: '2026-08-08', opened: 0, completed: 0 },
    { date: '2026-08-09', opened: 0, completed: 0 },
    { date: '2026-08-10', opened: 0, completed: 0 },
    { date: '2026-08-11', opened: 0, completed: 0 },
  ]);
  assert.deepEqual(dashboard.actionDeck, []);
  assert.deepEqual(dashboard.team, []);
  assert.equal(dashboard.finance.currency, 'AED');
  assert.equal(dashboard.health.score, 0);
});

test('uses current-month AED-first finance rules and never sums mixed currencies', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);
  assert.deepEqual(dashboard.finance, {
    billedMinor: 10000,
    paidMinor: 9000,
    dueSoonMinor: 2700,
    overdueMinor: 7300,
    currency: 'AED',
  });
  assert.equal(dashboard.kpis.collectedMinor, 9000);
  assert.equal(dashboard.kpis.collectionRate, 90);
});

test('selects a breached SLA case ahead of nearer unbreached SLA cases', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);
  assert.deepEqual(
    dashboard.actionDeck
      .filter((action) => action.kind === 'case')
      .map(({ id, urgency }) => ({ id, urgency })),
    [{ id: 'case-first-open', urgency: 'breached' }],
  );
});

test('applies Dubai-inclusive date boundaries to velocity, renewals, and invoice aging', () => {
  const input = baseInput();
  input.days = 30;
  input.renewals = [
    renewalRow({ id: 'r-now', due_date: '2026-08-11', type: 'license' }),
    renewalRow({ id: 'r-d7', due_date: '2026-08-18', type: 'license' }),
    renewalRow({ id: 'r-d8', due_date: '2026-08-19', type: 'visa' }),
    renewalRow({ id: 'r-d90', due_date: '2026-11-09', type: 'eid' }),
    renewalRow({ id: 'r-d91', due_date: '2026-11-10', type: 'ejari' }),
  ];
  input.invoices = [
    invoiceRow({ id: 'due-today', amount_minor: 400, due_at: '2026-08-11' }),
    invoiceRow({ id: 'overdue', amount_minor: 300, due_at: '2026-08-10' }),
  ];
  input.payments = [];
  input.refunds = [];

  const dashboard = calculateProDashboard(input, NOW);
  assert.deepEqual(dashboard.renewalStreams.license, { d7: 2, d30: 2, d60: 2, d90: 2 });
  assert.equal(dashboard.renewalStreams.visa.d7, 0);
  assert.equal(dashboard.renewalStreams.visa.d30, 1);
  assert.equal(dashboard.renewalStreams.eid.d90, 1);
  assert.equal(dashboard.renewalStreams.ejari.d90, 0);
  assert.equal(dashboard.finance.overdueMinor, 300);
  assert.equal(dashboard.finance.dueSoonMinor, 400);
});

test('moves case velocity timestamps at Dubai midnight into the next business bucket', () => {
  const input = emptyInput();
  input.serviceCases = [
    caseRow({
      id: 'before-midnight',
      created_at: '2026-08-05T19:59:59Z',
      completed_at: '2026-08-05T19:59:59Z',
    }),
    caseRow({
      id: 'at-midnight',
      created_at: '2026-08-05T20:00:00Z',
      completed_at: '2026-08-05T20:00:00Z',
    }),
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.deepEqual(dashboard.caseVelocity.slice(0, 2), [
    { date: '2026-08-05', opened: 1, completed: 1 },
    { date: '2026-08-06', opened: 1, completed: 1 },
  ]);
});

test('filters every relationship collection before joining tenant data', () => {
  const input = baseInput();
  input.documents.push({
    id: 'nested-cross-tenant-version',
    tenant_id: TENANT,
    client_id: 'client-1',
    label: 'Should not leak',
    currentVersion: { tenant_id: 'tenant-b', review_status: 'pending' },
  });
  const dashboard = calculateProDashboard(input, NOW);
  const serialised = JSON.stringify(dashboard);
  assert.doesNotMatch(
    serialised,
    /Intruder|Other tenant|Foreign document|Should not leak|case-x|invoice-x/,
  );
  assert.equal(dashboard.kpis.openCases, 3);
  assert.equal(dashboard.finance.billedMinor, 10000);
});

test('loads current document versions with an explicit tenant predicate and rejects mismatched rows', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const queryClient = {
    from(source: string) {
      calls.push(['from', source]);
      return {
        select(columns: string) {
          calls.push(['select', columns]);
          return {
            eq(column: string, value: string) {
              calls.push(['eq', column, value]);
              return {
                order(columnName: string, options: unknown) {
                  calls.push(['order', columnName, options]);
                  return {
                    range(from: number, to: number) {
                      calls.push(['range', from, to]);
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  await loadProDashboardRows(queryClient, 'document_versions', 'id, tenant_id', TENANT);
  assert.deepEqual(calls.slice(0, 3), [
    ['from', 'document_versions'],
    ['select', 'id, tenant_id'],
    ['eq', 'tenant_id', TENANT],
  ]);

  const documents = associateCurrentDocumentVersions(
    [
      {
        id: 'document-safe',
        tenant_id: TENANT,
        client_id: 'client-1',
        label: 'Safe',
        current_version_id: 'version-safe',
      },
      {
        id: 'document-mismatch',
        tenant_id: TENANT,
        client_id: 'client-1',
        label: 'Mismatch',
        current_version_id: 'version-other',
      },
    ],
    [
      { id: 'version-safe', tenant_id: TENANT, review_status: 'pending' },
      { id: 'version-other', tenant_id: 'tenant-b', review_status: 'pending' },
    ],
    TENANT,
  );
  assert.equal(documents[0].currentVersion?.review_status, 'pending');
  assert.equal(documents[1].currentVersion, null);
});

test('fetches only referenced current document versions with tenant and id predicates', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const queryClient = {
    from(source: string) {
      calls.push(['from', source]);
      return {
        select(columns: string) {
          calls.push(['select', columns]);
          return {
            eq(column: string, value: string) {
              calls.push(['eq', column, value]);
              return {
                in(idColumn: string, values: string[]) {
                  calls.push(['in', idColumn, values]);
                  return {
                    order(columnName: string, options: unknown) {
                      calls.push(['order', columnName, options]);
                      return {
                        range(from: number, to: number) {
                          calls.push(['range', from, to]);
                          return Promise.resolve({
                            data: [
                              { id: 'version-1', tenant_id: TENANT, review_status: 'pending' },
                            ],
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const versions = await loadReferencedDocumentVersions(
    queryClient,
    [
      {
        id: 'document-1',
        tenant_id: TENANT,
        client_id: 'client-1',
        label: 'Passport',
        current_version_id: 'version-1',
      },
      {
        id: 'document-2',
        tenant_id: TENANT,
        client_id: 'client-1',
        label: 'Duplicate head',
        current_version_id: 'version-1',
      },
    ],
    TENANT,
  );
  assert.deepEqual(
    versions.map((version) => version.id),
    ['version-1'],
  );
  assert.ok(
    calls.some((call) => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === TENANT),
  );
  assert.deepEqual(
    calls.find((call) => call[0] === 'in'),
    ['in', 'id', ['version-1']],
  );
});

test('paginates until a short batch and names query errors without leaking details', async () => {
  const calls: Array<[number, number]> = [];
  const rows = await collectProDashboardPages('clients', async (from, to) => {
    calls.push([from, to]);
    return {
      data: Array.from({ length: from === 0 ? 500 : 1 }, (_, index) => from + index),
      error: null,
    };
  });
  assert.equal(rows.length, 501);
  assert.deepEqual(calls, [
    [0, 499],
    [500, 999],
  ]);

  await assert.rejects(
    collectProDashboardPages('payments', async () => ({
      data: null,
      error: { message: 'postgres password=secret' },
    })),
    (error: unknown) =>
      error instanceof ProDashboardQueryError &&
      error.name === 'ProDashboardQueryError' &&
      error.message === 'Failed to load PRO dashboard payments',
  );
});

test('keeps active overdue renewals in backlog horizons but excludes inactive lifecycle rows', () => {
  const input = baseInput();
  input.renewals = [
    renewalRow({ id: 'old-overdue', due_date: '2020-01-01', status: 'overdue' }),
    renewalRow({ id: 'today', due_date: '2026-08-11', status: 'due_soon' }),
    renewalRow({ id: 'cancelled', due_date: '2026-08-12', status: 'cancelled' }),
    renewalRow({ id: 'completed', due_date: '2026-08-13', status: 'completed' }),
  ];

  const dashboard = calculateProDashboard(input, new Date('2026-08-10T20:30:00.000Z'));
  assert.deepEqual(dashboard.renewalStreams.license, { d7: 2, d30: 2, d60: 2, d90: 2 });
  assert.equal(dashboard.kpis.renewalsDue7d, 2);
  assert.equal(dashboard.kpis.renewalsDue30d, 2);
});

test('calculates all five transparent health inputs from actual timestamps', () => {
  const input = emptyInput();
  input.profiles = [
    { id: 'pro-1', tenant_id: TENANT, full_name: 'Aisha', role: 'pro', status: 'active' },
  ];
  input.serviceCases = [
    caseRow({ id: 'overdue', assigned_to: 'pro-1', sla_due_at: '2026-08-10T09:00:00Z' }),
    caseRow({
      id: 'old-blocked',
      assigned_to: 'pro-1',
      blocked_reason: 'Authority hold',
      sla_due_at: null,
      updated_at: '2026-08-07T09:59:59Z',
    }),
    caseRow({
      id: 'recent-blocked',
      assigned_to: 'pro-1',
      blocked_reason: 'Customer reply',
      sla_due_at: null,
      updated_at: '2026-08-10T10:00:01Z',
    }),
    caseRow({ id: 'moving', assigned_to: 'pro-1', sla_due_at: null }),
    caseRow({
      id: 'completed-on-time',
      status: 'completed',
      completed_at: '2026-08-10T09:00:00Z',
      sla_due_at: '2026-08-10T10:00:00Z',
    }),
    caseRow({
      id: 'completed-late',
      status: 'completed',
      completed_at: '2026-08-10T11:00:00Z',
      sla_due_at: '2026-08-10T10:00:00Z',
    }),
  ];
  input.renewals = [
    renewalRow({
      id: 'reminded',
      notify_at: ['2026-08-10T08:00:00Z'],
      last_notified_at: '2026-08-10T09:00:00Z',
    }),
    renewalRow({ id: 'missed', notify_at: ['2026-08-10T08:00:00Z'], last_notified_at: null }),
    renewalRow({
      id: 'future-schedule',
      notify_at: ['2026-08-12T08:00:00Z'],
      last_notified_at: null,
    }),
    renewalRow({ id: 'no-schedule', notify_at: [], last_notified_at: null }),
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.health.overdueRatio, 25);
  assert.equal(dashboard.health.slaCompletionRate, 50);
  assert.equal(dashboard.health.blockedRatio, 25);
  assert.equal(dashboard.health.reminderRate, 50);
  assert.equal(dashboard.health.workloadBalance, 100);
  assert.equal(dashboard.health.score, 70);
});

test('uses timestamp order rather than ISO text order for SLA health inputs', () => {
  const input = emptyInput();
  input.serviceCases = [
    caseRow({ id: 'open-overdue-offset', sla_due_at: '2026-08-11T12:00:00+04:00' }),
    caseRow({
      id: 'completed-on-time-offset',
      status: 'completed',
      completed_at: '2026-08-11T12:30:00+04:00',
      sla_due_at: '2026-08-11T09:00:00Z',
    }),
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.health.overdueRatio, 100);
  assert.equal(dashboard.health.slaCompletionRate, 100);
});

test('selects the highest-ranked signal per action kind with tenant-safe hrefs', () => {
  const input = emptyInput();
  input.tenantSlug = 'safe-firm';
  input.clients = [
    {
      id: 'client-1',
      tenant_id: TENANT,
      company_name: 'Acme',
      status: 'active',
      created_at: '2026-08-01T00:00:00Z',
    },
  ];
  input.profiles = [
    { id: 'pro-1', tenant_id: TENANT, full_name: 'Aisha', role: 'pro', status: 'active' },
  ];
  input.serviceCases = [
    caseRow({ id: 'manual-urgent', priority: 'urgent', sla_due_at: null }),
    caseRow({
      id: 'blocked-old',
      blocked_reason: 'Waiting for authority',
      updated_at: '2026-08-01T00:00:00Z',
      sla_due_at: null,
    }),
    caseRow({ id: 'sla-near', sla_due_at: '2026-08-12T00:00:00Z' }),
    caseRow({ id: 'sla-breached', sla_due_at: '2026-08-10T00:00:00Z' }),
  ];
  input.renewals = [renewalRow({ id: 'expiry', due_date: '2026-08-11' })];
  input.documentRequests = [
    {
      id: 'missing',
      tenant_id: TENANT,
      client_id: 'client-1',
      label: 'Passport',
      status: 'pending',
      due_at: null,
    },
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.deepEqual(
    dashboard.actionDeck.map((item) => item.id),
    ['sla-breached', 'expiry', 'missing'],
  );
  assert.deepEqual(
    dashboard.deadlineEvents.filter((event) => event.eventType === 'case').map((event) => event.id),
    ['sla-breached', 'sla-near'],
  );
  assert.equal(dashboard.actionDeck[0].href, '/t/safe-firm/applications?case=sla-breached');
  assert.equal(
    dashboard.actionDeck.find((item) => item.id === 'expiry')!.href,
    '/t/safe-firm/renewals?tab=active&renewal=expiry',
  );
  assert.equal(
    dashboard.actionDeck.find((item) => item.id === 'missing')!.href,
    '/t/safe-firm/clients/client-1?tab=documents&request=missing',
  );
});

test('selects the oldest blocked case ahead of newer blocks and manual priority', () => {
  const input = emptyInput();
  input.serviceCases = [
    caseRow({
      id: 'manual-urgent',
      priority: 'urgent',
      sla_due_at: null,
    }),
    caseRow({
      id: 'blocked-newer',
      blocked_reason: 'New hold',
      updated_at: '2026-08-10T00:00:00Z',
      sla_due_at: null,
    }),
    caseRow({
      id: 'blocked-oldest',
      blocked_reason: 'Old hold',
      updated_at: '2026-08-01T00:00:00Z',
      sla_due_at: null,
    }),
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.deepEqual(
    dashboard.actionDeck.map((item) => item.id),
    ['blocked-oldest'],
  );
  assert.match(dashboard.actionDeck[0].detail, /Old hold/);
});

test('uses Dubai current-month ledger rules and excludes draft, void, old, refunded, and mixed-currency amounts', () => {
  const input = emptyInput();
  input.invoices = [
    invoiceRow({ id: 'aug-a', amount_minor: 1000, created_at: '2026-08-01T00:00:00Z' }),
    invoiceRow({
      id: 'aug-at-dubai-midnight',
      amount_minor: 2000,
      created_at: '2026-07-31T20:00:00Z',
    }),
    invoiceRow({ id: 'july', amount_minor: 9000, created_at: '2026-07-31T19:59:59Z' }),
    invoiceRow({
      id: 'draft',
      amount_minor: 400,
      status: 'draft',
      created_at: '2026-08-02T00:00:00Z',
    }),
    invoiceRow({
      id: 'void',
      amount_minor: 500,
      status: 'void',
      created_at: '2026-08-02T00:00:00Z',
    }),
    invoiceRow({
      id: 'usd',
      amount_minor: 999999,
      currency: 'USD',
      created_at: '2026-08-02T00:00:00Z',
    }),
  ];
  input.payments = [
    paymentRow({
      id: 'paid-current',
      invoice_id: 'aug-a',
      amount_minor: 1500,
      received_at: '2026-08-10T00:00:00Z',
    }),
    paymentRow({
      id: 'paid-old',
      invoice_id: 'july',
      amount_minor: 500,
      received_at: '2026-07-31T19:59:59Z',
    }),
    paymentRow({ id: 'no-received-at', invoice_id: 'aug-a', amount_minor: 700, received_at: null }),
  ];
  input.refunds = [
    {
      id: 'refund-current',
      tenant_id: TENANT,
      payment_id: 'paid-current',
      amount_minor: 200,
      status: 'succeeded',
      created_at: '2026-08-10T01:00:00Z',
      reason: null,
    },
    {
      id: 'refund-current-for-old-payment',
      tenant_id: TENANT,
      payment_id: 'paid-old',
      amount_minor: 100,
      status: 'succeeded',
      created_at: '2026-08-10T01:00:00Z',
      reason: null,
    },
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.finance.billedMinor, 3000);
  assert.equal(dashboard.finance.paidMinor, 1200);
  assert.equal(dashboard.kpis.collectedMinor, 1200);
  assert.equal(dashboard.kpis.collectionRate, 40);
});

test('excludes orphan and cross-tenant payment/refund chains from finance metrics and currency', () => {
  const input = emptyInput();
  input.invoices = [invoiceRow({ id: 'owned-invoice', amount_minor: 1000 })];
  input.payments = [
    paymentRow({ id: 'owned-payment', invoice_id: 'owned-invoice', amount_minor: 800 }),
    paymentRow({ id: 'orphan-payment', invoice_id: 'foreign-invoice', amount_minor: 999999 }),
    paymentRow({
      id: 'orphan-usd',
      invoice_id: 'foreign-usd-invoice',
      amount_minor: 999999,
      currency: 'USD',
    }),
  ];
  input.refunds = [
    {
      id: 'owned-refund',
      tenant_id: TENANT,
      payment_id: 'owned-payment',
      amount_minor: 100,
      status: 'succeeded',
      reason: null,
      created_at: '2026-08-10T00:00:00Z',
    },
    {
      id: 'orphan-refund',
      tenant_id: TENANT,
      payment_id: 'orphan-payment',
      amount_minor: 500000,
      status: 'succeeded',
      reason: null,
      created_at: '2026-08-10T00:00:00Z',
    },
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.finance.currency, 'AED');
  assert.equal(dashboard.finance.paidMinor, 700);
  assert.equal(dashboard.kpis.collectedMinor, 700);
  assert.equal(dashboard.kpis.collectionRate, 70);
});

test('uses Dubai date and noon boundaries for deadline intensity event details', () => {
  const input = emptyInput();
  input.days = 7;
  input.serviceCases = [
    caseRow({ id: 'morning', sla_due_at: '2026-08-11T07:59:59Z' }),
    caseRow({ id: 'afternoon', sla_due_at: '2026-08-11T08:00:00Z' }),
  ];
  const dashboard = calculateProDashboard(input, new Date('2026-08-10T20:30:00Z'));
  assert.deepEqual(dashboard.deadlineIntensity[0], {
    date: '2026-08-11',
    morning: 1,
    afternoon: 1,
  });
  assert.deepEqual(
    dashboard.deadlineEvents
      .filter((event) => event.date === '2026-08-11')
      .map((event) => event.eventType),
    ['case', 'case'],
  );
});

test('uses the schema-valid sole PRO owner and exposes overload beyond 100 percent', () => {
  const input = emptyInput();
  input.clients = [
    {
      id: 'current',
      tenant_id: TENANT,
      company_name: 'Current',
      status: 'active',
      created_at: '2026-08-02T00:00:00Z',
    },
    {
      id: 'previous-a',
      tenant_id: TENANT,
      company_name: 'Previous A',
      status: 'active',
      created_at: '2026-07-10T00:00:00Z',
    },
    {
      id: 'previous-b',
      tenant_id: TENANT,
      company_name: 'Previous B',
      status: 'active',
      created_at: '2026-07-20T00:00:00Z',
    },
  ];
  input.profiles = [
    { id: 'owner', tenant_id: TENANT, full_name: 'Owner', role: 'pro', status: 'active' },
    {
      id: 'employee',
      tenant_id: TENANT,
      full_name: 'Client employee',
      role: 'employee',
      status: 'active',
    },
    {
      id: 'customer',
      tenant_id: TENANT,
      full_name: 'Customer',
      role: 'customer',
      status: 'active',
    },
    { id: 'admin', tenant_id: null, full_name: 'Platform admin', role: 'admin', status: 'active' },
  ];
  input.serviceCases = [
    ...Array.from({ length: 30 }, (_, index) =>
      caseRow({ id: `owner-${index}`, assigned_to: 'owner' }),
    ),
    caseRow({ id: 'blocked', assigned_to: null, blocked_reason: 'Hold' }),
  ];
  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.kpis.activeClientsChange, -1);
  assert.equal(dashboard.kpis.movingCases, 30);
  assert.equal(dashboard.kpis.blockedCases, 1);
  assert.equal(dashboard.kpis.unassignedCases, 1);
  assert.deepEqual(
    dashboard.team.map((member) => member.profileId),
    ['owner'],
  );
  assert.equal(dashboard.team[0].capacityPercent, 300);
  assert.equal(dashboard.health.workloadBalance, 3.3);
});

test('counts open workload assigned to a suspended former owner as unassigned', () => {
  const input = emptyInput();
  input.profiles = [
    {
      id: 'former-pro',
      tenant_id: TENANT,
      full_name: 'Former owner',
      role: 'pro',
      status: 'suspended',
    },
    { id: 'new-pro', tenant_id: TENANT, full_name: 'New owner', role: 'pro', status: 'active' },
  ];
  input.serviceCases = [
    caseRow({ id: 'orphaned-open', assigned_to: 'former-pro' }),
    caseRow({ id: 'current-open', assigned_to: 'new-pro' }),
    caseRow({
      id: 'historical',
      assigned_to: 'former-pro',
      status: 'completed',
      completed_at: NOW.toISOString(),
    }),
  ];

  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.kpis.openCases, 2);
  assert.equal(dashboard.kpis.unassignedCases, 1);
  assert.deepEqual(
    dashboard.team.map((member) => member.profileId),
    ['new-pro'],
  );
  assert.equal(dashboard.health.workloadBalance, 100);
});

test('dashboard action hrefs use filters and entity routes consumed by destination contracts', () => {
  const input = baseInput();
  input.serviceCases[0].id = '77777777-7777-4777-8777-777777777777';
  input.renewals[0].id = '88888888-8888-4888-8888-888888888888';
  input.documentRequests[0].id = '99999999-9999-4999-8999-999999999999';
  const dashboard = calculateProDashboard(input, NOW);
  const byKind = new Map(dashboard.actionDeck.map((action) => [action.kind, action]));
  const caseUrl = new URL(byKind.get('case')!.href, 'https://mandoob.test');
  assert.equal(caseUrl.pathname, '/t/acme/applications');
  assert.equal(caseUrl.searchParams.get('case'), input.serviceCases[0].id);
  const caseFilters = parseApplicationFilters({
    case: caseUrl.searchParams.get('case') ?? undefined,
  });
  assert.equal(caseFilters.id, input.serviceCases[0].id);
  assert.equal(caseFilters.status, undefined);
  assert.equal(caseFilters.assigned_to, undefined);

  const renewalUrl = new URL(byKind.get('renewal')!.href, 'https://mandoob.test');
  assert.equal(renewalUrl.pathname, '/t/acme/renewals');
  assert.deepEqual(
    parseRenewalSearch({
      tab: renewalUrl.searchParams.get('tab') ?? undefined,
      renewal: renewalUrl.searchParams.get('renewal') ?? undefined,
    }),
    { tab: 'active', renewalId: input.renewals[0].id },
  );

  const documentUrl = new URL(byKind.get('document')!.href, 'https://mandoob.test');
  assert.equal(documentUrl.pathname, '/t/acme/clients/client-1');
  assert.deepEqual(
    parseClientDetailSearch({
      tab: documentUrl.searchParams.get('tab') ?? undefined,
      request: documentUrl.searchParams.get('request') ?? undefined,
      document: documentUrl.searchParams.get('document') ?? undefined,
    }),
    { tab: 'documents', requestId: input.documentRequests[0].id, documentId: undefined },
  );
  assert.equal(byKind.get('invoice')!.href, '/t/acme/payments/invoice-overdue');
  assert.match(
    readFileSync(
      join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/page.tsx'),
      'utf8',
    ),
    /params:\s*Promise<\{ tenant: string; clientId: string \}>/,
  );
  assert.match(
    readFileSync(
      join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/[invoiceId]/page.tsx'),
      'utf8',
    ),
    /invoiceId/,
  );
});

test('profile transition migration clears only open cases owned by an invalidated PRO', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260812110000_0053_service_case_owner_transitions.sql',
    ),
    'utf8',
  );
  assert.match(sql, /after update of role, status, tenant_id on public\.profiles/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /old\.role = 'pro'[\s\S]*old\.status = 'active'/i);
  assert.match(sql, /new\.tenant_id is distinct from old\.tenant_id/i);
  assert.match(sql, /update public\.service_cases[\s\S]*set assigned_to = null/i);
  assert.match(sql, /status not in \('completed', 'cancelled'\)/i);
  assert.match(sql, /not exists \([\s\S]*owner\.role = 'pro'[\s\S]*owner\.status = 'active'/i);
  assert.doesNotMatch(sql, /set assigned_to\s*=\s*\([^n]/i);
});

test('finance relationship hardening migration uses tenant-owned chains without deleting legacy data', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260812100000_0052_dashboard_relationship_hardening.sql',
    ),
    'utf8',
  );
  assert.match(sql, /unique index[\s\S]*invoices\s*\(tenant_id, id\)/i);
  assert.match(sql, /unique index[\s\S]*payments\s*\(tenant_id, id\)/i);
  assert.match(
    sql,
    /foreign key \(tenant_id, invoice_id\)[\s\S]*invoices \(tenant_id, id\)[\s\S]*not valid/i,
  );
  assert.match(
    sql,
    /foreign key \(tenant_id, payment_id\)[\s\S]*payments \(tenant_id, id\)[\s\S]*not valid/i,
  );
  assert.match(sql, /invoices[\s\S]*tenant_id, currency, status, created_at/i);
  assert.match(sql, /payments[\s\S]*tenant_id, currency, status, received_at/i);
  assert.match(
    sql,
    /enforce_service_case_pro_assignee[\s\S]*role = 'pro'[\s\S]*status = 'active'/i,
  );
  assert.doesNotMatch(sql, /\b(?:delete|truncate)\b/i);
});

test('settles source failures independently for widget-local degradation', async () => {
  const settled = await settleProDashboardSources({
    clients: Promise.resolve(['client']),
    serviceCases: Promise.resolve(['case']),
    invoices: Promise.reject(new ProDashboardQueryError('invoices')),
    payments: Promise.resolve(['payment-that-must-not-form-a-partial-finance-widget']),
  });
  assert.deepEqual(settled.data.clients, ['client']);
  assert.deepEqual(settled.data.serviceCases, ['case']);
  assert.deepEqual(settled.data.invoices, []);
  assert.deepEqual(settled.data.payments, []);
  assert.deepEqual(settled.errors, { finance: 'Failed to load PRO dashboard invoices' });
});

test('keeps fulfilled client metrics when tenant slug loading fails', async () => {
  const settled = await settleProDashboardSources({
    tenantSlug: Promise.reject(new ProDashboardQueryError('tenant')),
    clients: Promise.resolve(['client']),
    serviceCases: Promise.resolve(['case']),
  });
  assert.deepEqual(settled.data.tenantSlug, []);
  assert.deepEqual(settled.data.clients, ['client']);
  assert.deepEqual(settled.data.serviceCases, ['case']);
  assert.deepEqual(settled.errors, { links: 'Failed to load PRO dashboard tenant' });

  const input = emptyInput();
  delete input.tenantSlug;
  input.clients = [{ id: 'client-1', tenant_id: TENANT, company_name: 'Acme', status: 'active' }];
  input.serviceCases = [caseRow({ id: 'safe-action' })];
  input.errors = settled.errors;
  const dashboard = calculateProDashboard(input, NOW);
  assert.equal(dashboard.kpis.activeClients, 1);
  assert.equal(dashboard.actionDeck[0].href, '#');
  assert.deepEqual(dashboard.errors, { links: 'Failed to load PRO dashboard tenant' });
});

test('uses a safe inert href when a tenant slug is unavailable', () => {
  const input = emptyInput();
  delete input.tenantSlug;
  input.serviceCases = [caseRow({ id: 'case-without-slug' })];
  assert.equal(calculateProDashboard(input, NOW).actionDeck[0].href, '#');
});

function emptyInput(): ProDashboardInput {
  const input = baseInput();
  for (const key of [
    'clients',
    'profiles',
    'serviceCases',
    'renewals',
    'documentRequests',
    'documents',
    'invoices',
    'payments',
    'refunds',
  ] as const)
    input[key] = [] as never;
  return input;
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    tenant_id: TENANT,
    client_id: 'client-1',
    title: 'License application',
    service_type: 'License',
    status: 'submitted',
    priority: 'normal',
    assigned_to: null,
    due_at: null,
    sla_due_at: '2026-08-15T10:00:00.000Z',
    blocked_reason: null,
    completed_at: null,
    created_at: '2026-08-10T10:00:00.000Z',
    updated_at: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

function renewalRow(
  overrides: Partial<ProDashboardInput['renewals'][number]> = {},
): ProDashboardInput['renewals'][number] {
  return {
    id: 'renewal-1',
    tenant_id: TENANT,
    client_id: 'client-1',
    type: 'license',
    label: 'Trade license',
    due_date: '2026-08-18',
    status: 'due_soon',
    last_notified_at: null,
    ...overrides,
  };
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    tenant_id: TENANT,
    client_id: 'client-1',
    label: 'Government fee',
    amount_minor: 1000,
    currency: 'AED',
    status: 'open',
    due_at: '2026-08-20',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    tenant_id: TENANT,
    invoice_id: 'invoice-1',
    amount_minor: 1000,
    currency: 'AED',
    status: 'succeeded',
    method: 'card',
    provider: 'tap',
    failure_reason: null,
    received_at: '2026-08-10T00:00:00.000Z',
    created_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}
