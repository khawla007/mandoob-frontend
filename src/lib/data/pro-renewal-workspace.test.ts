import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRenewalUrgency,
  createRenewalWorkspaceSupabaseStore,
  listProRenewalWorkspace,
  parseRenewalWorkspaceSearch,
  renewalWorkspaceHref,
  type RenewalWorkspaceStore,
} from './pro-renewal-workspace';

test('renewal workspace accepts only supported URL filters and preserves a valid focus target', () => {
  const focus = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(
    parseRenewalWorkspaceSearch({
      tab: ['active', 'cancelled'],
      type: ['license', 'passport'],
      status: ['due_soon', 'completed'],
      urgency: ['30', '45'],
      q: ['  trade  ', 'ignored'],
      page: ['2', '3'],
      target: [focus, 'ignored'],
    }),
    {
      tab: 'active',
      type: 'license',
      status: 'due_soon',
      urgency: '30',
      q: 'trade',
      page: 2,
      focus,
    },
  );
  assert.deepEqual(parseRenewalWorkspaceSearch({ type: 'passport', urgency: '45', page: '-1' }), {
    tab: 'active',
    type: 'all',
    status: 'all',
    urgency: 'all',
    q: '',
    page: 1,
    focus: null,
  });
  assert.equal(
    parseRenewalWorkspaceSearch({ tab: 'completed', status: 'overdue' }).status,
    'all',
    'terminal tabs must not retain an ignored active-status filter',
  );
});

test('renewal workspace links preserve the supported filter and reset pagination when filters change', () => {
  const search = parseRenewalWorkspaceSearch({
    tab: 'completed',
    type: 'eid',
    urgency: '90',
    q: 'EID',
    page: '3',
  });
  assert.equal(
    renewalWorkspaceHref('north star/uae', search),
    '/t/north%20star%2Fuae/renewals?tab=completed&type=eid&urgency=90&q=EID&page=3',
  );
  assert.equal(
    renewalWorkspaceHref('acme', { ...search, page: 1 }),
    '/t/acme/renewals?tab=completed&type=eid&urgency=90&q=EID',
  );
});

test('renewal urgency uses Dubai business dates and separates overdue, today, windows, future, and terminal records', () => {
  const today = '2026-08-12';
  assert.equal(classifyRenewalUrgency('2026-08-11', 'overdue', today), 'overdue');
  assert.equal(classifyRenewalUrgency('2026-08-12', 'due_soon', today), 'today');
  assert.equal(classifyRenewalUrgency('2026-08-19', 'upcoming', today), '7');
  assert.equal(classifyRenewalUrgency('2026-09-11', 'upcoming', today), '30');
  assert.equal(classifyRenewalUrgency('2026-10-11', 'upcoming', today), '60');
  assert.equal(classifyRenewalUrgency('2026-11-10', 'upcoming', today), '90');
  assert.equal(classifyRenewalUrgency('2026-11-11', 'upcoming', today), 'future');
  assert.equal(classifyRenewalUrgency('2026-08-01', 'completed', today), 'completed');
  assert.equal(classifyRenewalUrgency('2026-08-01', 'cancelled', today), 'cancelled');
});

test('renewal workspace authorizes before its exact Company-scoped store read and distinguishes empty, no-results, partial, and unavailable', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const store: RenewalWorkspaceStore = {
    list: async (input) => {
      calls.push(input);
      return { data: [], count: 0, error: null };
    },
    total: async (input) => {
      calls.push(input);
      return { count: 4, error: null };
    },
  };
  const result = await listProRenewalWorkspace(
    {
      actorProfileId: 'pro-1',
      tenantSlug: 'acme',
      search: parseRenewalWorkspaceSearch({ q: 'license', page: '2' }),
    },
    {
      authorize: async () => ({ tenantId: 'tenant-1', companyId: 'company-1' }),
      store,
      today: '2026-08-12',
    },
  );
  assert.equal(result.state, 'no_results');
  assert.equal(result.total, 0);
  assert.equal(result.unfilteredTotal, 4);
  assert.equal(result.canonicalPage, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.tenantId === 'tenant-1' && call.companyId === 'company-1'));

  const base = {
    actorProfileId: 'pro-1',
    tenantSlug: 'acme',
    search: parseRenewalWorkspaceSearch({}),
  };
  const authorize = async () => ({ tenantId: 'tenant-1', companyId: 'company-1' });
  const stateFor = async (
    listed: { data: []; count: number | null; error: unknown | null },
    total: { count: number | null; error: unknown | null },
  ) =>
    listProRenewalWorkspace(base, {
      authorize,
      store: { list: async () => listed, total: async () => total },
      today: '2026-08-12',
    });
  assert.equal(
    (await stateFor({ data: [], count: 0, error: null }, { count: 0, error: null })).state,
    'empty',
  );
  assert.equal(
    (
      await stateFor(
        { data: [], count: 1, error: null },
        { count: null, error: new Error('private') },
      )
    ).state,
    'partial',
  );
  assert.equal(
    (
      await stateFor(
        { data: [], count: null, error: new Error('private') },
        { count: 0, error: null },
      )
    ).state,
    'unavailable',
  );
});

test('renewal workspace never reaches the store when authorization fails', async () => {
  let queried = false;
  await assert.rejects(
    listProRenewalWorkspace(
      {
        actorProfileId: 'pro-1',
        tenantSlug: 'acme',
        search: parseRenewalWorkspaceSearch({}),
      },
      {
        authorize: async () => {
          throw new Error('ASSIGNED_COMPANY_MISMATCH');
        },
        store: {
          list: async () => {
            queried = true;
            return { data: [], count: 0, error: null };
          },
          total: async () => ({ count: 0, error: null }),
        },
      },
    ),
    /ASSIGNED_COMPANY_MISMATCH/u,
  );
  assert.equal(queried, false);
});

test('renewal Supabase adapter applies exact tenant and Company ownership, stable ordering, and a bounded range', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const response = { data: [], count: 1, error: null };
  const fluent = {
    select: (...args: unknown[]) => {
      calls.push(['select', ...args]);
      return fluent;
    },
    eq: (...args: unknown[]) => {
      calls.push(['eq', ...args]);
      return fluent;
    },
    in: (...args: unknown[]) => {
      calls.push(['in', ...args]);
      return fluent;
    },
    ilike: (...args: unknown[]) => {
      calls.push(['ilike', ...args]);
      return fluent;
    },
    lte: (...args: unknown[]) => {
      calls.push(['lte', ...args]);
      return fluent;
    },
    gte: (...args: unknown[]) => {
      calls.push(['gte', ...args]);
      return fluent;
    },
    lt: (...args: unknown[]) => {
      calls.push(['lt', ...args]);
      return fluent;
    },
    gt: (...args: unknown[]) => {
      calls.push(['gt', ...args]);
      return fluent;
    },
    order: (...args: unknown[]) => {
      calls.push(['order', ...args]);
      return fluent;
    },
    range: (...args: unknown[]) => {
      calls.push(['range', ...args]);
      return fluent;
    },
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  const store = createRenewalWorkspaceSupabaseStore({ from: () => fluent } as never);
  const search = parseRenewalWorkspaceSearch({
    type: 'license',
    urgency: '30',
    q: 'trade',
    page: '2',
  });
  await store.list({
    tenantId: 'tenant-1',
    companyId: 'company-1',
    search,
    from: 25,
    to: 49,
    today: '2026-08-12',
  });
  await store.total({ tenantId: 'tenant-1', companyId: 'company-1' });
  assert.deepEqual(calls, [
    [
      'select',
      'id, tenant_id, company_id, type, label, due_date, status, source, completed_at, created_at, updated_at',
      { count: 'exact' },
    ],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
    ['in', 'status', ['upcoming', 'due_soon', 'overdue']],
    ['eq', 'type', 'license'],
    ['ilike', 'label', '%trade%'],
    ['gt', 'due_date', '2026-08-19'],
    ['lte', 'due_date', '2026-09-11'],
    ['order', 'due_date', { ascending: true }],
    ['order', 'id', { ascending: true }],
    ['range', 25, 49],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
  ]);
});
