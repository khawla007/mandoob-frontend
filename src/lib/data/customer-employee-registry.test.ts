import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerEmployeeRegistrySupabaseStore,
  customerEmployeeRegistryHref,
  listCustomerEmployeeRegistry,
  parseCustomerEmployeeRegistrySearch,
  type CustomerEmployeeRegistryClient,
  type CustomerEmployeeRegistryStore,
} from './customer-employee-registry';

const authorized = {
  kind: 'authorized' as const,
  tenant: { id: 'tenant-1', slug: 'acme' },
  session: { id: 'customer-1', role: 'customer' as const, tenantId: 'tenant-1' },
  company: {
    id: 'company-1',
    tenantId: 'tenant-1',
    companyName: 'Acme',
    status: 'active',
    onboardingStatus: 'complete',
  },
} as never;

test('Customer employee search is bounded, deterministic, and resets invalid values', () => {
  assert.deepEqual(
    parseCustomerEmployeeRegistrySearch({
      q: '  Noor  ',
      status: 'active',
      expiry: 'missing',
      sort: 'visa_expiry',
      direction: 'desc',
      page: '3',
    }),
    {
      q: 'Noor',
      status: 'active',
      expiry: 'missing',
      sort: 'visa_expiry',
      direction: 'desc',
      page: 3,
    },
  );
  assert.deepEqual(
    parseCustomerEmployeeRegistrySearch({
      q: 'x'.repeat(121),
      status: 'deleted',
      expiry: 'secret',
      sort: 'passport',
      direction: 'sideways',
      page: '-1',
    }),
    { q: '', status: 'all', expiry: 'all', sort: 'name', direction: 'asc', page: 1 },
  );
  assert.equal(
    customerEmployeeRegistryHref('north star/uae', {
      q: 'Noor',
      status: 'active',
      expiry: 'attention',
      sort: 'eid_expiry',
      direction: 'desc',
      page: 2,
    }),
    '/t/north%20star%2Fuae/portal/employees?q=Noor&status=active&expiry=attention&sort=eid_expiry&direction=desc&page=2',
  );
});

test('Customer employee loader authorizes before reads and preserves unlinked and operator states', async () => {
  let queried = false;
  const store: CustomerEmployeeRegistryStore = {
    list: async () => {
      queried = true;
      return { data: [], count: 0, error: null };
    },
    total: async () => ({ count: 0, error: null }),
  };
  const input = { tenantSlug: 'acme', search: parseCustomerEmployeeRegistrySearch({}) };
  const unlinked = await listCustomerEmployeeRegistry(input, {
    authorize: async () => ({ kind: 'unlinked' }) as never,
    store,
  });
  assert.equal(unlinked.state, 'unlinked');
  assert.equal(queried, false);
  const preview = await listCustomerEmployeeRegistry(input, {
    authorize: async () => ({ kind: 'operator-preview' }) as never,
    store,
  });
  assert.equal(preview.state, 'permission');
  assert.equal(queried, false);
});

test('Customer employee loader scopes list and total to linked tenant and Company', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await listCustomerEmployeeRegistry(
    {
      tenantSlug: 'acme',
      search: parseCustomerEmployeeRegistrySearch({ status: 'active', page: '2' }),
    },
    {
      authorize: async () => authorized,
      store: {
        list: async (input) => {
          calls.push(input);
          return { data: [], count: 0, error: null };
        },
        total: async (input) => {
          calls.push(input);
          return { count: 5, error: null };
        },
      },
    },
  );
  assert.equal(result.state, 'no-results');
  assert.equal(result.canonicalPage, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.tenantId === 'tenant-1' && call.companyId === 'company-1'));
});

test('Customer employee loader rejects service-role rows outside the authorized tenant and Company', async () => {
  const result = await listCustomerEmployeeRegistry(
    { tenantSlug: 'acme', search: parseCustomerEmployeeRegistrySearch({}) },
    {
      authorize: async () => authorized,
      store: {
        list: async () => ({
          data: [
            {
              id: 'safe',
              tenant_id: 'tenant-1',
              company_id: 'company-1',
              name: 'Safe',
              nationality: null,
              status: 'active',
              visa_expiry: null,
              eid_expiry: null,
            },
            {
              id: 'foreign',
              tenant_id: 'tenant-1',
              company_id: 'company-2',
              name: 'Foreign',
              nationality: null,
              status: 'active',
              visa_expiry: null,
              eid_expiry: null,
            },
          ],
          count: 2,
          error: null,
        }),
        total: async () => ({ count: 2, error: null }),
      },
    },
  );
  assert.equal(result.state, 'error');
  assert.equal(result.rows.length, 0);
});

test('Customer employee registry distinguishes ready, empty, no-results, error, and partial totals', async () => {
  const input = { tenantSlug: 'acme', search: parseCustomerEmployeeRegistrySearch({}) };
  const run = (
    listed: Awaited<ReturnType<CustomerEmployeeRegistryStore['list']>>,
    total: Awaited<ReturnType<CustomerEmployeeRegistryStore['total']>>,
  ) =>
    listCustomerEmployeeRegistry(input, {
      authorize: async () => authorized,
      store: { list: async () => listed, total: async () => total },
    });
  assert.equal(
    (await run({ data: [], count: 0, error: null }, { count: 0, error: null })).state,
    'empty',
  );
  assert.equal(
    (await run({ data: [], count: 0, error: null }, { count: 2, error: null })).state,
    'no-results',
  );
  assert.equal(
    (await run({ data: null, count: null, error: new Error('private') }, { count: 2, error: null }))
      .state,
    'error',
  );
  assert.equal(
    (await run({ data: [], count: 0, error: null }, { count: null, error: new Error('private') }))
      .state,
    'partial',
  );
});

test('Customer employee registry sanitizes rejected source promises into typed states', async () => {
  const input = { tenantSlug: 'acme', search: parseCustomerEmployeeRegistrySearch({}) };
  const listRejected = await listCustomerEmployeeRegistry(input, {
    authorize: async () => authorized,
    store: {
      list: async () => {
        throw new Error('private');
      },
      total: async () => ({ count: 1, error: null }),
    },
  });
  assert.equal(listRejected.state, 'error');
  const totalRejected = await listCustomerEmployeeRegistry(input, {
    authorize: async () => authorized,
    store: {
      list: async () => ({ data: [], count: 0, error: null }),
      total: async () => {
        throw new Error('private');
      },
    },
  });
  assert.equal(totalRejected.state, 'partial');
});

test('Customer employee registry treats malformed expiry dates as missing', async () => {
  const result = await listCustomerEmployeeRegistry(
    { tenantSlug: 'acme', search: parseCustomerEmployeeRegistrySearch({}) },
    {
      authorize: async () => authorized,
      today: '2026-09-05',
      store: {
        list: async () => ({
          data: [
            {
              id: 'employee-1',
              tenant_id: 'tenant-1',
              company_id: 'company-1',
              name: 'Safe',
              nationality: null,
              status: 'active',
              visa_expiry: '2026-02-30',
              eid_expiry: null,
            },
          ],
          count: 1,
          error: null,
        }),
        total: async () => ({ count: 1, error: null }),
      },
    },
  );
  assert.equal(result.rows[0]?.visaState, 'missing');
  assert.equal(result.rows[0]?.visaExpiry, null);
});

test('Customer employee adapter selects approved HR fields only and scopes/filter/sorts/ranges every read', async () => {
  const traces: Array<[string, ...unknown[]]> = [];
  const response = { data: [], count: 0, error: null };
  const query = Object.fromEntries(
    ['select', 'eq', 'is', 'not', 'or', 'order', 'range'].map((method) => [
      method,
      (...args: unknown[]) => {
        traces.push([method, ...args]);
        return query;
      },
    ]),
  ) as Record<string, (...args: unknown[]) => unknown> & {
    then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
  };
  query.then = (resolve) => Promise.resolve(response).then(resolve);
  const store = createCustomerEmployeeRegistrySupabaseStore(
    { from: () => query } as unknown as CustomerEmployeeRegistryClient,
    '2026-09-05',
  );
  await store.list({
    tenantId: 'tenant-1',
    companyId: 'company-1',
    from: 25,
    to: 49,
    search: parseCustomerEmployeeRegistrySearch({
      q: 'Noor',
      status: 'active',
      expiry: 'missing',
      sort: 'visa_expiry',
      direction: 'desc',
      page: '2',
    }),
  });
  await store.total({ tenantId: 'tenant-1', companyId: 'company-1' });
  assert.deepEqual(traces[0], [
    'select',
    'id, tenant_id, company_id, name, nationality, status, visa_expiry, eid_expiry',
    { count: 'exact' },
  ]);
  assert.ok(
    traces.some((call) => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === 'tenant-1'),
  );
  assert.ok(
    traces.some((call) => call[0] === 'eq' && call[1] === 'company_id' && call[2] === 'company-1'),
  );
  assert.ok(traces.some((call) => call[0] === 'range' && call[1] === 25 && call[2] === 49));
  assert.ok(traces.some((call) => call[0] === 'order' && call[1] === 'visa_expiry'));
  assert.doesNotMatch(String(traces[0]?.[1]), /email|phone|passport|visa_no|emirates_id/u);
});
