import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCustomerRenewalBucket,
  createCustomerRenewalSupabaseStore,
  customerRenewalHref,
  listCustomerRenewals,
  parseCustomerRenewalSearch,
  type CustomerRenewalClient,
  type CustomerRenewalStore,
} from './customer-renewal-workspace';

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

test('renewal search and links are bounded, canonical, encoded, and reset pagination', () => {
  const parsed = parseCustomerRenewalSearch({
    bucket: 'due-soon',
    type: 'visa',
    q: ' Noor ',
    page: '2',
  });
  assert.deepEqual(parsed, { bucket: 'due-soon', type: 'visa', q: 'Noor', page: 2, focus: null });
  assert.deepEqual(
    parseCustomerRenewalSearch({
      bucket: 'fake',
      type: 'passport',
      q: 'x'.repeat(121),
      page: '-1',
      focus: 'bad',
    }),
    { bucket: 'active', type: 'all', q: '', page: 1, focus: null },
  );
  assert.equal(
    customerRenewalHref('north star/uae', parsed),
    '/t/north%20star%2Fuae/portal/renewals?bucket=due-soon&type=visa&q=Noor&page=2',
  );
  assert.equal(
    customerRenewalHref('acme', { ...parsed, page: 9 }, 1),
    '/t/acme/portal/renewals?bucket=due-soon&type=visa&q=Noor',
  );
});

test('Dubai renewal buckets separate overdue, today/due-soon, upcoming, completed, cancelled, and missing dates', () => {
  const today = '2026-09-05';
  assert.equal(classifyCustomerRenewalBucket('2026-09-04', 'overdue', today), 'overdue');
  assert.equal(classifyCustomerRenewalBucket('2026-09-05', 'upcoming', today), 'due-soon');
  assert.equal(classifyCustomerRenewalBucket('2026-10-05', 'due_soon', today), 'due-soon');
  assert.equal(classifyCustomerRenewalBucket('2026-10-06', 'upcoming', today), 'upcoming');
  assert.equal(classifyCustomerRenewalBucket(null, 'upcoming', today), 'missing-date');
  assert.equal(classifyCustomerRenewalBucket('2026-02-30', 'upcoming', today), 'missing-date');
  assert.equal(classifyCustomerRenewalBucket(null, 'completed', today), 'completed');
  assert.equal(classifyCustomerRenewalBucket('2026-09-01', 'cancelled', today), 'cancelled');
});

test('terminal renewal rows never expose an active day offset', async () => {
  for (const status of ['completed', 'cancelled'] as const) {
    const result = await listCustomerRenewals(
      { tenantSlug: 'acme', search: parseCustomerRenewalSearch({ bucket: status }) },
      {
        authorize: async () => authorized,
        today: '2026-09-05',
        store: {
          list: async () => ({
            data: [
              {
                id: status,
                tenant_id: 'tenant-1',
                company_id: 'company-1',
                employee_id: null,
                type: 'license',
                label: 'Trade licence',
                due_date: '2026-08-01',
                status,
                source: 'manual',
                completed_at: status === 'completed' ? '2026-08-01T00:00:00Z' : null,
              },
            ],
            count: 1,
            error: null,
          }),
          total: async () => ({ count: 1, error: null }),
          bucketCount: async () => ({ count: 1, error: null }),
        },
      },
    );
    assert.equal(result.rows[0]?.daysOut, null);
  }
});

test('employee renewals resolve an approved label through exact tenant and Company scope', async () => {
  const employeeCalls: Array<Record<string, unknown>> = [];
  const result = await listCustomerRenewals(
    { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) },
    {
      authorize: async () => authorized,
      today: '2026-09-05',
      store: {
        list: async () => ({
          data: [
            {
              id: 'renewal-1',
              tenant_id: 'tenant-1',
              company_id: 'company-1',
              employee_id: 'employee-1',
              type: 'visa',
              label: 'Visa renewal',
              due_date: '2026-10-01',
              status: 'due_soon',
              source: 'manual',
              completed_at: null,
            },
          ],
          count: 1,
          error: null,
        }),
        total: async () => ({ count: 1, error: null }),
        bucketCount: async () => ({ count: 1, error: null }),
        employees: async (input) => {
          employeeCalls.push(input);
          return {
            data: [
              {
                id: 'employee-1',
                tenant_id: 'tenant-1',
                company_id: 'company-1',
                name: 'Noor Ahmed',
              },
            ],
            error: null,
          };
        },
      },
    },
  );
  assert.deepEqual(employeeCalls, [
    { tenantId: 'tenant-1', companyId: 'company-1', ids: ['employee-1'] },
  ]);
  assert.equal(result.rows[0]?.entityKind, 'employee');
  assert.equal(result.rows[0]?.entityLabel, 'Noor Ahmed');
  assert.equal(result.rows[0]?.entityLabelState, 'ready');
});

test('employee renewal resolution fails closed on a cross-Company employee row', async () => {
  const result = await listCustomerRenewals(
    { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) },
    {
      authorize: async () => authorized,
      today: '2026-09-05',
      store: {
        list: async () => ({
          data: [
            {
              id: 'renewal-1',
              tenant_id: 'tenant-1',
              company_id: 'company-1',
              employee_id: 'employee-1',
              type: 'visa',
              label: 'Visa renewal',
              due_date: '2026-10-01',
              status: 'due_soon',
              source: 'manual',
              completed_at: null,
            },
          ],
          count: 1,
          error: null,
        }),
        total: async () => ({ count: 1, error: null }),
        bucketCount: async () => ({ count: 1, error: null }),
        employees: async () => ({
          data: [
            { id: 'employee-1', tenant_id: 'tenant-1', company_id: 'company-2', name: 'Foreign' },
          ],
          error: null,
        }),
      },
    },
  );
  assert.equal(result.state, 'error');
  assert.equal(result.rows.length, 0);
});

test('renewal loader authorizes directly and never reads for unlinked or operator preview', async () => {
  let queried = false;
  const store: CustomerRenewalStore = {
    list: async () => {
      queried = true;
      return { data: [], count: 0, error: null };
    },
    total: async () => ({ count: 0, error: null }),
    bucketCount: async () => ({ count: 0, error: null }),
  };
  const input = { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) };
  assert.equal(
    (
      await listCustomerRenewals(input, {
        authorize: async () => ({ kind: 'unlinked' }) as never,
        store,
        today: '2026-09-05',
      })
    ).state,
    'unlinked',
  );
  assert.equal(
    (
      await listCustomerRenewals(input, {
        authorize: async () => ({ kind: 'operator-preview' }) as never,
        store,
        today: '2026-09-05',
      })
    ).state,
    'permission',
  );
  assert.equal(queried, false);
});

test('renewal loader scopes every read and keeps exact bucket counts independent from list failure', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const store: CustomerRenewalStore = {
    list: async (input) => {
      calls.push(input);
      return { data: null, count: null, error: new Error('private') };
    },
    total: async (input) => {
      calls.push(input);
      return { count: 7, error: null };
    },
    bucketCount: async (input) => {
      calls.push(input);
      return { count: input.bucket === 'overdue' ? 2 : 1, error: null };
    },
  };
  const result = await listCustomerRenewals(
    { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) },
    { authorize: async () => authorized, store, today: '2026-09-05' },
  );
  assert.equal(result.state, 'error');
  assert.deepEqual(result.summaries, { overdue: 2, 'due-soon': 1, upcoming: 1, completed: 1 });
  assert.ok(calls.every((call) => call.tenantId === 'tenant-1' && call.companyId === 'company-1'));
});

test('renewal loader settles rejected list, total, and summary promises without exposing diagnostics', async () => {
  const input = { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) };
  const listRejected = await listCustomerRenewals(input, {
    authorize: async () => authorized,
    today: '2026-09-05',
    store: {
      list: async () => {
        throw new Error('private');
      },
      total: async () => ({ count: 1, error: null }),
      bucketCount: async () => ({ count: 1, error: null }),
    },
  });
  assert.equal(listRejected.state, 'error');
  const summaryRejected = await listCustomerRenewals(input, {
    authorize: async () => authorized,
    today: '2026-09-05',
    store: {
      list: async () => ({ data: [], count: 0, error: null }),
      total: async () => {
        throw new Error('private');
      },
      bucketCount: async ({ bucket }) => {
        if (bucket === 'overdue') throw new Error('private');
        return { count: 1, error: null };
      },
    },
  });
  assert.equal(summaryRejected.state, 'partial');
  assert.equal(summaryRejected.summaries.overdue, null);
  assert.equal(summaryRejected.summaries.upcoming, 1);
});

test('renewal loader fails closed when a service-role row escapes the authorized Company scope', async () => {
  const result = await listCustomerRenewals(
    { tenantSlug: 'acme', search: parseCustomerRenewalSearch({}) },
    {
      authorize: async () => authorized,
      today: '2026-09-05',
      store: {
        list: async () => ({
          data: [
            {
              id: 'foreign',
              tenant_id: 'tenant-1',
              company_id: 'company-2',
              type: 'visa',
              label: 'Foreign',
              due_date: null,
              status: 'upcoming',
              source: 'manual',
              completed_at: null,
            },
          ],
          count: 1,
          error: null,
        }),
        total: async () => ({ count: 1, error: null }),
        bucketCount: async () => ({ count: 0, error: null }),
      },
    },
  );
  assert.equal(result.state, 'error');
  assert.equal(result.rows.length, 0);
});

test('renewal loader distinguishes empty, no-results, partial summary, and missing-date rows', async () => {
  const input = {
    tenantSlug: 'acme',
    search: parseCustomerRenewalSearch({ bucket: 'missing-date' }),
  };
  const run = (listCount: number, totalCount: number, bucketError = false) =>
    listCustomerRenewals(input, {
      authorize: async () => authorized,
      today: '2026-09-05',
      store: {
        list: async () => ({
          data: listCount
            ? [
                {
                  id: 'renewal-1',
                  tenant_id: 'tenant-1',
                  company_id: 'company-1',
                  type: 'visa',
                  label: 'Visa renewal',
                  due_date: '2026-02-30',
                  status: 'upcoming',
                  source: 'manual',
                  completed_at: null,
                },
              ]
            : [],
          count: listCount,
          error: null,
        }),
        total: async () => ({ count: totalCount, error: null }),
        bucketCount: async () =>
          bucketError ? { count: null, error: new Error('private') } : { count: 0, error: null },
      },
    });
  assert.equal((await run(0, 0)).state, 'empty');
  assert.equal((await run(0, 3)).state, 'no-results');
  const partial = await run(1, 3, true);
  assert.equal(partial.state, 'partial');
  assert.equal(partial.rows[0]?.bucket, 'missing-date');
  assert.equal(partial.rows[0]?.dueDate, null);
  assert.deepEqual(partial.summaries, {
    overdue: null,
    'due-soon': null,
    upcoming: null,
    completed: null,
  });
});

test('renewal adapter scopes every list/count/bucket query and uses stable due-date/id ordering', async () => {
  const traces: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const response = { data: [], count: 0, error: null };
  const client = {
    from(table: string) {
      const trace = { table, calls: [] as Array<[string, ...unknown[]]> };
      traces.push(trace);
      const query = Object.fromEntries(
        [
          'select',
          'eq',
          'in',
          'ilike',
          'is',
          'not',
          'lt',
          'lte',
          'gt',
          'gte',
          'order',
          'range',
        ].map((method) => [
          method,
          (...args: unknown[]) => {
            trace.calls.push([method, ...args]);
            return query;
          },
        ]),
      ) as Record<string, (...args: unknown[]) => unknown> & {
        then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
      };
      query.then = (resolve) => Promise.resolve(response).then(resolve);
      return query;
    },
  };
  const store = createCustomerRenewalSupabaseStore(client as unknown as CustomerRenewalClient);
  const access = { tenantId: 'tenant-1', companyId: 'company-1' };
  await store.list({
    ...access,
    search: parseCustomerRenewalSearch({ bucket: 'due-soon', q: 'visa' }),
    today: '2026-09-05',
    from: 0,
    to: 24,
  });
  await store.total(access);
  await store.bucketCount({ ...access, bucket: 'overdue', today: '2026-09-05' });
  await store.employees?.({ ...access, ids: ['employee-1'] });
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
  }
  assert.ok(traces[0]?.calls.some((call) => call[0] === 'order' && call[1] === 'due_date'));
  assert.ok(traces[0]?.calls.some((call) => call[0] === 'order' && call[1] === 'id'));
  assert.ok(
    traces[0]?.calls.some((call) => call[0] === 'range' && call[1] === 0 && call[2] === 24),
  );
  const employeeTrace = traces.find((trace) => trace.table === 'employees');
  assert.ok(
    employeeTrace?.calls.some(
      (call) => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === 'tenant-1',
    ),
  );
  assert.ok(
    employeeTrace?.calls.some(
      (call) => call[0] === 'eq' && call[1] === 'company_id' && call[2] === 'company-1',
    ),
  );
  assert.ok(employeeTrace?.calls.some((call) => call[0] === 'in' && call[1] === 'id'));
});
