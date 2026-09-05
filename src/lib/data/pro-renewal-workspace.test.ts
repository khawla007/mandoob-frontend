import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRenewalUrgency,
  createRenewalWorkspaceSupabaseStore,
  listProRenewalWorkspace,
  renewalWorkspaceCanonicalRedirect,
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
      dateState: 'all',
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
    dateState: 'all',
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
    '/t/north%20star%2Fuae/renewals?tab=completed&type=eid&q=EID&page=3',
  );
  assert.equal(
    renewalWorkspaceHref('acme', { ...search, page: 1 }),
    '/t/acme/renewals?tab=completed&type=eid&q=EID',
  );
});

test('renewal page canonical redirect preserves semantic filters, focus, and page while dropping raw legacy, repeats, and unsupported keys', () => {
  const focus = '44444444-4444-4444-8444-444444444444';
  const raw = {
    type: ['license', 'passport'],
    days: ['30', '90'],
    target: [focus, 'not-a-uuid'],
    q: ['  trade  ', 'ignored'],
    date: ['2028-02-29', '2026-99-99'],
    period: ['morning', 'afternoon'],
    eventTypes: ['renewal', 'invoice'],
    page: ['3', '4'],
    noise: 'drop-me',
  };
  const parsed = parseRenewalWorkspaceSearch(raw);
  assert.equal(
    renewalWorkspaceCanonicalRedirect('acme', raw, { ...parsed, focus: null }),
    '/t/acme/renewals?type=license&urgency=30&q=trade&due=recorded&date=2028-02-29&period=morning&eventTypes=renewal&page=3',
  );
  assert.equal(
    renewalWorkspaceCanonicalRedirect('acme', raw, parsed),
    `/t/acme/renewals?type=license&urgency=30&q=trade&focus=${focus}&due=recorded&date=2028-02-29&period=morning&eventTypes=renewal`,
    'a focused renewal is a one-record queue, so canonical pagination is page one',
  );
  const canonical = '/t/acme/renewals?type=license&urgency=30&q=trade&page=3';
  assert.equal(
    renewalWorkspaceCanonicalRedirect(
      'acme',
      { type: 'license', urgency: '30', q: 'trade', page: '3' },
      parseRenewalWorkspaceSearch({ type: 'license', urgency: '30', q: 'trade', page: '3' }),
    ),
    null,
    'canonical requests must not redirect in a loop',
  );
  assert.equal(canonical, '/t/acme/renewals?type=license&urgency=30&q=trade&page=3');
});

test('renewal workspace consumes legacy Signal focus, days, and Dubai deadline links without dropping their filters', () => {
  const focus = '22222222-2222-4222-8222-222222222222';
  const parsed = parseRenewalWorkspaceSearch({
    renewal: focus,
    days: '30',
    date: '2026-08-12',
    period: 'afternoon',
    eventTypes: 'renewal',
  });
  assert.deepEqual(parsed, {
    tab: 'active',
    type: 'all',
    status: 'all',
    urgency: '30',
    q: '',
    page: 1,
    focus,
    deadlineDate: '2026-08-12',
    deadlinePeriod: 'afternoon',
    dateState: 'recorded',
  });
  assert.equal(
    renewalWorkspaceHref('acme', parsed),
    `/t/acme/renewals?urgency=30&focus=${focus}&due=recorded&date=2026-08-12&period=afternoon&eventTypes=renewal`,
  );
  assert.deepEqual(
    parseRenewalWorkspaceSearch({ date: 'bad', period: 'afternoon', eventTypes: 'renewal' }),
    {
      tab: 'active',
      type: 'all',
      status: 'all',
      urgency: 'all',
      q: '',
      page: 1,
      focus: null,
      dateState: 'all',
    },
  );
});

test('renewal workspace rejects malformed calendar dates without throwing, including repeated query values', () => {
  for (const date of ['2026-99-99', '2026-04-31', '2026-02-29']) {
    assert.doesNotThrow(() =>
      parseRenewalWorkspaceSearch({ date, period: 'afternoon', eventTypes: 'renewal' }),
    );
    assert.equal(
      parseRenewalWorkspaceSearch({ date, period: 'afternoon', eventTypes: 'renewal' })
        .deadlineDate,
      undefined,
    );
  }
  assert.deepEqual(
    parseRenewalWorkspaceSearch({
      date: ['2026-99-99', '2026-08-12'],
      period: ['afternoon', 'morning'],
      eventTypes: ['renewal', 'invoice'],
    }),
    {
      tab: 'active',
      type: 'all',
      status: 'all',
      urgency: 'all',
      q: '',
      page: 1,
      focus: null,
      dateState: 'all',
    },
  );
  assert.equal(
    parseRenewalWorkspaceSearch({
      date: '2028-02-29',
      period: 'morning',
      eventTypes: 'renewal',
    }).deadlineDate,
    '2028-02-29',
  );
});

test('terminal tabs canonicalize urgency while missing-date remains an explicit distinct filter', () => {
  const terminal = parseRenewalWorkspaceSearch({
    tab: 'completed',
    urgency: '30',
    days: '90',
    due: 'missing',
  });
  assert.equal(terminal.urgency, 'all');
  assert.equal(terminal.dateState, 'missing');
  assert.equal(classifyRenewalUrgency(null, 'completed', '2026-08-12'), 'completed');
  assert.equal(classifyRenewalUrgency(null, 'cancelled', '2026-08-12'), 'cancelled');
  assert.equal(classifyRenewalUrgency(null, 'upcoming', '2026-08-12'), 'missing');
  assert.doesNotMatch(
    renewalWorkspaceHref('acme', { ...terminal, urgency: '90' }),
    /urgency=/u,
    'terminal links must not reintroduce an ignored urgency window',
  );
});

test('renewal urgency uses Dubai business dates and separates overdue, today, cumulative windows, future, and terminal records', () => {
  const today = '2026-08-12';
  assert.equal(classifyRenewalUrgency('2026-08-11', 'overdue', today), 'overdue');
  assert.equal(classifyRenewalUrgency('2026-08-12', 'due_soon', today), 'today');
  assert.equal(classifyRenewalUrgency('2026-08-19', 'upcoming', today), '7');
  assert.equal(classifyRenewalUrgency('2026-08-20', 'upcoming', today), '30');
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
      companyId: 'company-1',
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
    companyId: 'company-1',
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
  const unavailable = await stateFor(
    { data: [], count: null, error: new Error('private') },
    { count: 0, error: null },
  );
  assert.equal(unavailable.total, null, 'failed reads must not manufacture a numeric zero total');
});

test('renewal workspace never reaches the store when authorization fails', async () => {
  let queried = false;
  await assert.rejects(
    listProRenewalWorkspace(
      {
        actorProfileId: 'pro-1',
        tenantSlug: 'acme',
        companyId: 'company-1',
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

test('renewal workspace rejects a stale route assignment before store reads', async () => {
  let queried = false;
  await assert.rejects(
    listProRenewalWorkspace(
      {
        actorProfileId: 'pro-1',
        tenantSlug: 'acme',
        companyId: 'stale-company',
        search: parseRenewalWorkspaceSearch({}),
      },
      {
        authorize: async () => ({ tenantId: 'tenant-1', companyId: 'company-1' }),
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
    ['gt', 'due_date', '2026-08-12'],
    ['lte', 'due_date', '2026-09-11'],
    ['order', 'due_date', { ascending: true }],
    ['order', 'id', { ascending: true }],
    ['range', 25, 49],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
  ]);
});

test('renewal adapter keeps terminal rows out of urgency windows and can query defensively missing due dates', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const response = { data: [], count: 0, error: null };
  const fluent = Object.fromEntries(
    ['select', 'eq', 'in', 'ilike', 'lte', 'gte', 'lt', 'gt', 'is', 'not', 'order', 'range'].map(
      (method) => [
        method,
        (...args: unknown[]) => {
          calls.push([method, ...args]);
          return fluent;
        },
      ],
    ),
  ) as Record<string, (...args: unknown[]) => unknown> & {
    then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
  };
  fluent.then = (resolve) => Promise.resolve(response).then(resolve);
  const store = createRenewalWorkspaceSupabaseStore({ from: () => fluent } as never);
  await store.list({
    tenantId: 'tenant-1',
    companyId: 'company-1',
    search: parseRenewalWorkspaceSearch({ tab: 'completed', urgency: '30', due: 'missing' }),
    from: 0,
    to: 24,
    today: '2026-08-12',
  });
  assert.deepEqual(calls, [
    [
      'select',
      'id, tenant_id, company_id, type, label, due_date, status, source, completed_at, created_at, updated_at',
      { count: 'exact' },
    ],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
    ['in', 'status', ['completed']],
    ['is', 'due_date', null],
    ['order', 'due_date', { ascending: true }],
    ['order', 'id', { ascending: true }],
    ['range', 0, 24],
  ]);
});

test('renewal adapter keeps exact Signal target, cumulative days, and Dubai deadline constraints together', async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const response = { data: [], count: 0, error: null };
  const fluent = Object.fromEntries(
    ['select', 'eq', 'in', 'ilike', 'lte', 'gte', 'lt', 'gt', 'is', 'not', 'order', 'range'].map(
      (method) => [
        method,
        (...args: unknown[]) => {
          calls.push([method, ...args]);
          return fluent;
        },
      ],
    ),
  ) as Record<string, (...args: unknown[]) => unknown> & {
    then: (resolve: (value: typeof response) => unknown) => Promise<unknown>;
  };
  fluent.then = (resolve) => Promise.resolve(response).then(resolve);
  const focus = '33333333-3333-4333-8333-333333333333';
  const store = createRenewalWorkspaceSupabaseStore({ from: () => fluent } as never);
  await store.list({
    tenantId: 'tenant-1',
    companyId: 'company-1',
    search: parseRenewalWorkspaceSearch({
      target: focus,
      days: '30',
      date: '2026-08-12',
      period: 'morning',
      eventTypes: 'renewal',
    }),
    from: 0,
    to: 24,
    today: '2026-08-01',
  });
  assert.deepEqual(calls, [
    [
      'select',
      'id, tenant_id, company_id, type, label, due_date, status, source, completed_at, created_at, updated_at',
      { count: 'exact' },
    ],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
    ['eq', 'id', focus],
    ['in', 'status', ['upcoming', 'due_soon', 'overdue']],
    ['not', 'due_date', 'is', null],
    ['eq', 'due_date', '2026-08-12'],
    ['gt', 'due_date', '2026-08-01'],
    ['lte', 'due_date', '2026-08-31'],
    ['order', 'due_date', { ascending: true }],
    ['order', 'id', { ascending: true }],
    ['range', 0, 24],
  ]);
});
