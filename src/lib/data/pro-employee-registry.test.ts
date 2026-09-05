import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  createEmployeeRegistrySupabaseStore,
  employeeIdentifierDisplayState,
  employeeRisk,
  listProEmployeeRegistry,
  parseEmployeeRegistrySearch,
  type EmployeeRegistrySupabaseClient,
} from './pro-employee-registry';

test('registry search accepts only bounded, deterministic filter values', () => {
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: '  registry  ',
      status: 'active',
      visa: 'recorded_expiry',
      eid: 'missing_expiry',
      risk: 'attention',
      page: '2',
    }),
    {
      q: 'registry',
      status: 'active',
      visa: 'recorded_expiry',
      eid: 'missing_expiry',
      risk: 'attention',
      page: 2,
      focus: null,
    },
  );
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: 'x'.repeat(300),
      status: 'mutated',
      page: '-2',
      focus: 'not-a-uuid',
    }),
    {
      q: '',
      status: 'all',
      visa: 'any',
      eid: 'any',
      risk: 'all',
      page: 1,
      focus: null,
    },
  );
});

test('registry reports renewal attention from only date-backed visa and EID values', () => {
  assert.equal(employeeRisk('2026-05-31', null, new Date('2026-05-01T00:00:00Z')), 'attention');
  assert.equal(employeeRisk(null, '2026-12-01', new Date('2026-05-01T00:00:00Z')), 'clear');
  assert.equal(employeeRisk(null, null, new Date('2026-05-01T00:00:00Z')), 'unknown');
});

test('registry marks Visa and EID identifiers unavailable without an accepted display contract', () => {
  assert.equal(employeeIdentifierDisplayState(), 'unavailable_without_masked_contract');
});

test('registry authorizes the actor before querying and scopes every store call to the resolved Company', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await listProEmployeeRegistry(
    {
      actorProfileId: 'pro-1',
      tenantSlug: 'acme',
      search: parseEmployeeRegistrySearch({
        status: 'active',
        visa: 'recorded_expiry',
        eid: 'missing_expiry',
        page: '2',
      }),
    },
    {
      authorize: async ({ actorProfileId, tenantSlug }) => {
        assert.equal(actorProfileId, 'pro-1');
        assert.equal(tenantSlug, 'acme');
        return { tenantId: 'tenant-1', companyId: 'company-1' };
      },
      store: {
        list: async (input) => {
          calls.push(input);
          return { data: [], count: 0, error: null };
        },
        total: async (input) => {
          calls.push(input);
          return { count: 3, error: null };
        },
      },
    },
  );

  assert.equal(result.state, 'no_results');
  assert.equal(result.canonicalPage, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.tenantId === 'tenant-1' && call.companyId === 'company-1'));
  assert.deepEqual(calls[0]?.search, {
    q: '',
    status: 'active',
    visa: 'recorded_expiry',
    eid: 'missing_expiry',
    risk: 'all',
    page: 2,
    focus: null,
  });
});

test('Supabase registry adapter composes search, expiry, risk, tenant, Company, count, order, and range predicates', async () => {
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
    not: (...args: unknown[]) => {
      calls.push(['not', ...args]);
      return fluent;
    },
    is: (...args: unknown[]) => {
      calls.push(['is', ...args]);
      return fluent;
    },
    or: (...args: unknown[]) => {
      calls.push(['or', ...args]);
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
  const store = createEmployeeRegistrySupabaseStore(
    { from: () => fluent } as unknown as EmployeeRegistrySupabaseClient,
    new Date('2026-05-01'),
  );
  const search = parseEmployeeRegistrySearch({
    q: 'registry',
    status: 'active',
    visa: 'recorded_expiry',
    eid: 'missing_expiry',
    risk: 'attention',
    focus: '11111111-1111-4111-8111-111111111111',
    page: '2',
  });

  const listed = await store.list({
    tenantId: 'tenant-1',
    companyId: 'company-1',
    search,
    from: 25,
    to: 49,
  });
  const total = await store.total({ tenantId: 'tenant-1', companyId: 'company-1' });

  assert.deepEqual(listed, response);
  assert.deepEqual(total, response);
  assert.deepEqual(calls, [
    ['select', 'id, name, email, nationality, status, visa_expiry, eid_expiry', { count: 'exact' }],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
    ['eq', 'status', 'active'],
    ['not', 'visa_expiry', 'is', null],
    ['is', 'eid_expiry', null],
    ['or', 'visa_expiry.lte.2026-07-30,eid_expiry.lte.2026-07-30'],
    ['eq', 'id', '11111111-1111-4111-8111-111111111111'],
    ['or', 'name.ilike.%registry%,email.ilike.%registry%'],
    ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: true }],
    ['range', 25, 49],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'tenant_id', 'tenant-1'],
    ['eq', 'company_id', 'company-1'],
  ]);
});

test('inactive or cross-Company authorization cannot reach the service-role store', async () => {
  for (const code of ['TENANT_INACTIVE', 'ASSIGNED_COMPANY_MISMATCH']) {
    let queried = false;
    await assert.rejects(
      listProEmployeeRegistry(
        { actorProfileId: 'pro-1', tenantSlug: 'acme', search: parseEmployeeRegistrySearch({}) },
        {
          authorize: async () => {
            throw new Error(code);
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
      new RegExp(code),
    );
    assert.equal(queried, false);
  }
});

test('registry distinguishes empty, no-results, unavailable, and partial count failure without source rows', async () => {
  const search = parseEmployeeRegistrySearch({});
  const authorize = async () => ({ tenantId: 'tenant-1', companyId: 'company-1' });
  const base = { actorProfileId: 'pro-1', tenantSlug: 'acme', search };
  const withStore = async (
    list: { count: number | null; error: unknown },
    total: { count: number | null; error: unknown },
  ) =>
    listProEmployeeRegistry(base, {
      authorize,
      store: { list: async () => ({ data: [], ...list }), total: async () => total },
    });

  assert.equal(
    (await withStore({ count: 0, error: null }, { count: 0, error: null })).state,
    'empty',
  );
  assert.equal(
    (await withStore({ count: 0, error: null }, { count: 5, error: null })).state,
    'no_results',
  );
  assert.equal(
    (await withStore({ count: null, error: new Error('private') }, { count: 0, error: null }))
      .state,
    'unavailable',
  );
  assert.equal(
    (await withStore({ count: 1, error: null }, { count: null, error: new Error('private') }))
      .state,
    'partial',
  );
  const unavailableOnLaterPage = await listProEmployeeRegistry(
    { ...base, search: parseEmployeeRegistrySearch({ page: '3' }) },
    {
      authorize,
      store: {
        list: async () => ({ data: null, count: null, error: new Error('private') }),
        total: async () => ({ count: 0, error: null }),
      },
    },
  );
  assert.equal(unavailableOnLaterPage.canonicalPage, 3);
});

test('registry page is a Company-scoped, server-paginated read-only workspace', () => {
  const root = process.cwd();
  const page = readFileSync(
    join(root, 'src/app/(tenant)/t/[tenant]/(pro)/employees/page.tsx'),
    'utf8',
  );
  const data = readFileSync(join(root, 'src/lib/data/pro-employee-registry.ts'), 'utf8');
  const workspace = readFileSync(
    join(root, 'src/components/pro/EmployeeRegistryWorkspace.tsx'),
    'utf8',
  );

  assert.match(page, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.match(page, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(page, /listProEmployeeRegistry\(\{/u);
  assert.match(data, /actorProfileId/u);
  assert.match(data, /visa:\s*z\.enum\(\['any', 'recorded_expiry', 'missing_expiry'\]\)/u);
  assert.match(data, /eid:\s*z\.enum\(\['any', 'recorded_expiry', 'missing_expiry'\]\)/u);
  assert.match(data, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(data, /count: 'exact'/u);
  assert.match(
    data,
    /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: true \}\)/u,
  );
  assert.doesNotMatch(page, /ComingSoon|create|update|delete|document request/iu);
  assert.doesNotMatch(data, /passport_no_encrypted|visa_no_encrypted|emirates_id_encrypted/iu);
  assert.match(workspace, /name="visa"/u);
  assert.match(workspace, /name="eid"/u);
  assert.match(workspace, /identifierState/u);
});
