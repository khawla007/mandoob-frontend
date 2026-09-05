import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerFinanceSupabaseStore,
  listCustomerFinance,
  loadCustomerInvoiceDetail,
  type CustomerFinanceStore,
} from './customer-finance-workspace';

const invoice = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 'tenant-1',
  company_id: 'company-1',
  customer_profile_id: 'profile-1',
  label: 'Trade licence fee',
  amount_minor: 2500,
  currency: 'AED',
  status: 'open',
  due_at: '2026-09-10',
  paid_at: null,
  created_at: '2026-09-01T00:00:00Z',
};
const authorized = {
  kind: 'authorized',
  tenant: { id: 'tenant-1', slug: 'acme' },
  session: { id: 'profile-1', role: 'customer', tenantId: 'tenant-1' },
  company: { id: 'company-1', tenantId: 'tenant-1', companyName: 'Acme' },
} as never;

function store(overrides: Partial<CustomerFinanceStore> = {}): CustomerFinanceStore {
  return {
    list: async () => ({ data: [invoice], count: 1, error: null }),
    total: async () => ({ data: null, count: 1, error: null }),
    payments: async () => ({ data: [], error: null }),
    refunds: async () => ({ data: [], error: null }),
    provider: async () => 'configured',
    invoice: async () => ({ data: invoice, error: null }),
    ...overrides,
  };
}

test('finance list passes authoritative actor, tenant, and linked Company scope', async () => {
  let received: unknown;
  const result = await listCustomerFinance(
    'acme',
    { status: 'open', page: 1, invoice: null },
    {
      authorize: async () => authorized,
      store: store({
        list: async (input) => {
          received = input;
          return { data: [invoice], count: 1, error: null };
        },
      }),
    },
  );
  assert.equal(result.state, 'ready');
  assert.match((received as { today: string }).today, /^\d{4}-\d{2}-\d{2}$/u);
  assert.deepEqual(received, {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    profileId: 'profile-1',
    search: { status: 'open', page: 1, invoice: null },
    today: (received as { today: string }).today,
    from: 0,
    to: 24,
  });
});

test('finance list fails closed on cross-Company rows and unsafe money', async () => {
  for (const row of [
    { ...invoice, company_id: 'company-2' },
    { ...invoice, amount_minor: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const result = await listCustomerFinance(
      'acme',
      { status: 'all', page: 1, invoice: null },
      {
        authorize: async () => authorized,
        store: store({ list: async () => ({ data: [row], count: 1, error: null }) }),
      },
    );
    assert.equal(result.state, 'error');
  }
});

test('finance sources degrade independently instead of becoming false empty', async () => {
  const result = await listCustomerFinance(
    'acme',
    { status: 'all', page: 1, invoice: null },
    {
      authorize: async () => authorized,
      store: store({
        total: async () => ({ data: null, count: null, error: 'no' }),
        payments: async () => ({ data: null, error: 'no' }),
        provider: async () => 'error',
      }),
    },
  );
  assert.equal(result.state, 'partial');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.latestPayment, null);
  assert.equal(result.unfilteredTotal, null);
});

test('invoice detail is non-disclosing and chains payments/refunds through the owned invoice', async () => {
  let paymentIds: string[] = [];
  const result = await loadCustomerInvoiceDetail('acme', invoice.id, {
    authorize: async () => authorized,
    store: store({
      payments: async (_tenantId, ids) => {
        assert.deepEqual(ids, [invoice.id]);
        return {
          data: [
            {
              id: 'payment-1',
              tenant_id: 'tenant-1',
              invoice_id: invoice.id,
              amount_minor: 2500,
              currency: 'AED',
              method: 'card',
              status: 'succeeded',
              received_at: '2026-09-02T00:00:00Z',
              created_at: '2026-09-02T00:00:00Z',
            },
          ],
          error: null,
        };
      },
      refunds: async (_tenantId, ids) => {
        paymentIds = ids;
        return { data: [], error: null };
      },
    }),
  });
  assert.equal(result.state, 'ready');
  assert.deepEqual(paymentIds, ['payment-1']);

  const foreign = await loadCustomerInvoiceDetail('acme', invoice.id, {
    authorize: async () => authorized,
    store: store({
      invoice: async () => ({ data: { ...invoice, company_id: 'other' }, error: null }),
    }),
  });
  assert.deepEqual(foreign, { state: 'not-found' });
});

test('Supabase store scopes every invoice query to tenant, Company, and actor profile', async () => {
  const calls: Array<[string, string, unknown]> = [];
  const client = {
    from(table: string) {
      const response =
        table === 'invoices' ? { data: [], count: 0, error: null } : { data: [], error: null };
      const query = new Proxy(Promise.resolve(response) as object, {
        get(target, property) {
          if (property === 'then') return (target as Promise<unknown>).then.bind(target);
          return (...args: unknown[]) => {
            calls.push([table, String(property), args]);
            return query;
          };
        },
      });
      return query;
    },
  };
  const financeStore = createCustomerFinanceSupabaseStore(client as never);
  const scope = { tenantId: 'tenant-1', companyId: 'company-1', profileId: 'profile-1' };
  await financeStore.list({
    ...scope,
    search: { status: 'all', page: 1, invoice: null },
    today: '2026-09-05',
    from: 0,
    to: 24,
  });
  await financeStore.total(scope);
  await financeStore.invoice({ ...scope, invoiceId: invoice.id });
  for (const column of ['tenant_id', 'company_id', 'customer_profile_id']) {
    assert.equal(
      calls.filter(
        ([table, method, args]) =>
          table === 'invoices' && method === 'eq' && (args as unknown[])[0] === column,
      ).length,
      3,
    );
  }
});
