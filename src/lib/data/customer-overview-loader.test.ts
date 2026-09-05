import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerOverviewSupabaseStore,
  loadCustomerOverview,
  type CustomerOverviewStore,
} from './customer-overview-loader';

function authorizedAccess() {
  return {
    kind: 'authorized' as const,
    tenant: { id: 'tenant-1', slug: 'acme' },
    session: { id: 'profile-1', role: 'customer' as const, tenantId: 'tenant-1' },
    company: {
      id: 'company-1',
      tenantId: 'tenant-1',
      companyName: 'Acme',
      status: 'active',
      onboardingStatus: 'complete',
    },
  } as never;
}

test('Supabase overview store scopes every Company read and additionally scopes invoices to profile', async () => {
  const traces: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const client = {
    from(table: string) {
      const trace = { table, calls: [] as Array<[string, ...unknown[]]> };
      traces.push(trace);
      const response = { data: [], count: table === 'invoices' ? 0 : null, error: null };
      const builder = Object.fromEntries(
        ['select', 'eq', 'in', 'order', 'limit'].map((method) => [
          method,
          (...args: unknown[]) => {
            trace.calls.push([method, ...args]);
            return builder;
          },
        ]),
      ) as Record<string, (...args: unknown[]) => unknown> & {
        then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
      };
      builder.then = (resolve) => Promise.resolve(response).then(resolve);
      return builder;
    },
  };
  const store = createCustomerOverviewSupabaseStore(client as never);

  await Promise.all([
    store.invoiceOpenCount('tenant-1', 'company-1', 'profile-1'),
    store.invoiceRecent('tenant-1', 'company-1', 'profile-1'),
    store.invoiceOpenRows('tenant-1', 'company-1', 'profile-1'),
    store.documentRequests('tenant-1', 'company-1'),
    store.documents('tenant-1', 'company-1'),
    store.renewals('tenant-1', 'company-1'),
  ]);

  for (const trace of traces) {
    assert.ok(
      trace.calls.some(
        (call) => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === 'tenant-1',
      ),
    );
    assert.ok(
      trace.calls.some(
        (call) => call[0] === 'eq' && call[1] === 'company_id' && call[2] === 'company-1',
      ),
    );
    if (trace.table === 'invoices') {
      assert.ok(
        trace.calls.some(
          (call) =>
            call[0] === 'eq' && call[1] === 'customer_profile_id' && call[2] === 'profile-1',
        ),
      );
    }
  }
});

test('query failures settle only their corresponding overview widgets as errors', async () => {
  const ok = { data: [], count: 0, error: null };
  const failed = { data: null, count: null, error: new Error('provider detail') };
  const store: CustomerOverviewStore = {
    invoiceOpenCount: async () => failed,
    invoiceRecent: async () => ok,
    invoiceOpenRows: async () => ok,
    documentRequests: async () => failed,
    documents: async () => ok,
    renewals: async () => failed,
  };

  const result = await loadCustomerOverview(authorizedAccess(), { store });

  assert.deepEqual(result.documentRequests, { kind: 'error' });
  assert.deepEqual(result.documents, { kind: 'empty', value: [] });
  assert.deepEqual(result.renewals, { kind: 'error' });
  assert.deepEqual(result.invoices, { kind: 'error' });
});

test('invalid invoice amounts settle the finance widget as an error', async () => {
  const ok = { data: [], count: 1, error: null };
  const unsafe = {
    data: [
      {
        id: 'invoice-1',
        label: 'Invoice',
        amount_minor: Number.MAX_SAFE_INTEGER + 1,
        currency: 'AED',
        status: 'open',
        due_at: null,
      },
    ],
    count: null,
    error: null,
  };
  const store: CustomerOverviewStore = {
    invoiceOpenCount: async () => ok,
    invoiceRecent: async () => unsafe,
    invoiceOpenRows: async () => unsafe,
    documentRequests: async () => ({ data: [], count: null, error: null }),
    documents: async () => ({ data: [], count: null, error: null }),
    renewals: async () => ({ data: [], count: null, error: null }),
  };

  const result = await loadCustomerOverview(authorizedAccess(), { store });
  assert.deepEqual(result.invoices, { kind: 'error' });
});
