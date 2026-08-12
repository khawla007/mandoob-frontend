import assert from 'node:assert/strict';
import test from 'node:test';
import {
  associateCurrentDocumentVersions,
  calculateProDashboard,
  collectProDashboardPages,
  loadProDashboardRows,
  ProDashboardQueryError,
  type ProDashboardInput,
} from './pro-dashboard';

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TENANT = 'tenant-a';

function baseInput(): ProDashboardInput {
  return {
    tenantId: TENANT,
    days: 7,
    clients: [
      { id: 'client-1', tenant_id: TENANT, company_name: 'Acme', status: 'active' },
      { id: 'client-2', tenant_id: TENANT, company_name: 'Beacon', status: 'active' },
      { id: 'client-3', tenant_id: TENANT, company_name: 'Dormant', status: 'suspended' },
      { id: 'client-x', tenant_id: 'tenant-b', company_name: 'Intruder', status: 'active' },
    ],
    profiles: [
      { id: 'pro-1', tenant_id: TENANT, full_name: 'Aisha', role: 'pro', status: 'active' },
      { id: 'pro-2', tenant_id: TENANT, full_name: 'Bilal', role: 'pro', status: 'active' },
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
      caseRow({ id: 'case-3', client_id: 'client-2', assigned_to: 'pro-2' }),
      caseRow({
        id: 'case-first-complete',
        client_id: 'client-2',
        status: 'completed',
        created_at: '2026-08-05T18:00:00.000Z',
        completed_at: '2026-08-05T20:00:00.000Z',
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
      },
      {
        id: 'refund-x',
        tenant_id: 'tenant-b',
        payment_id: 'payment-x',
        amount_minor: 888888,
        status: 'succeeded',
      },
    ],
  };
}

test('aggregates the tenant-scoped PRO operations contract', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);

  assert.equal(dashboard.generatedAt, NOW.toISOString());
  assert.equal(dashboard.kpis.activeClients, 2);
  assert.equal(dashboard.kpis.openCases, 3);
  assert.equal(dashboard.kpis.renewalsDue30d, 2);
  assert.equal(dashboard.finance.overdueMinor, 7300);
  assert.deepEqual(
    dashboard.actionDeck.slice(0, 4).map((action) => action.kind),
    ['case', 'renewal', 'document', 'invoice'],
  );
  assert.deepEqual(dashboard.caseVelocity[0], { date: '2026-08-05', opened: 2, completed: 1 });
  assert.equal(dashboard.renewalStreams.license.d7, 1);
  assert.ok(Object.values(dashboard.health).every((value) => value >= 0 && value <= 100));
  assert.deepEqual(
    dashboard.team.map((member) => member.profileId),
    ['pro-1', 'pro-2'],
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

test('uses the existing AED-first finance rules and never sums mixed currencies', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);
  assert.deepEqual(dashboard.finance, {
    billedMinor: 10000,
    paidMinor: 9000,
    dueSoonMinor: 2700,
    overdueMinor: 7300,
    currency: 'AED',
  });
  assert.equal(dashboard.kpis.collectedMinor, 9000);
  assert.equal(dashboard.kpis.collectionRate, 47.4);
});

test('ranks actions by urgency, deadline, and stable kind precedence', () => {
  const dashboard = calculateProDashboard(baseInput(), NOW);
  assert.deepEqual(
    dashboard.actionDeck.slice(0, 4).map(({ kind, urgency }) => ({ kind, urgency })),
    [
      { kind: 'case', urgency: 'breached' },
      { kind: 'renewal', urgency: 'breached' },
      { kind: 'document', urgency: 'breached' },
      { kind: 'invoice', urgency: 'breached' },
    ],
  );
});

test('applies UTC-inclusive date boundaries to velocity, renewals, and invoice aging', () => {
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
