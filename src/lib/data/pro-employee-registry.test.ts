import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  employeeRisk,
  listProEmployeeRegistry,
  parseEmployeeRegistrySearch,
} from './pro-employee-registry';

test('registry search accepts only bounded, deterministic filter values', () => {
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: '  registry  ',
      status: 'active',
      identity: 'visa',
      risk: 'attention',
      page: '2',
    }),
    { q: 'registry', status: 'active', identity: 'visa', risk: 'attention', page: 2, focus: null },
  );
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: 'x'.repeat(300),
      status: 'mutated',
      page: '-2',
      focus: 'not-a-uuid',
    }),
    { q: '', status: 'all', identity: 'all', risk: 'all', page: 1, focus: null },
  );
});

test('registry reports renewal attention from only date-backed visa and EID values', () => {
  assert.equal(employeeRisk('2026-05-31', null, new Date('2026-05-01T00:00:00Z')), 'attention');
  assert.equal(employeeRisk(null, '2026-12-01', new Date('2026-05-01T00:00:00Z')), 'clear');
  assert.equal(employeeRisk(null, null, new Date('2026-05-01T00:00:00Z')), 'unknown');
});

test('registry authorizes the actor before querying and scopes every store call to the resolved Company', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await listProEmployeeRegistry(
    {
      actorProfileId: 'pro-1',
      tenantSlug: 'acme',
      search: parseEmployeeRegistrySearch({ status: 'active', identity: 'visa', page: '2' }),
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
    identity: 'visa',
    risk: 'all',
    page: 2,
    focus: null,
  });
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

  assert.match(page, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.match(page, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(page, /listProEmployeeRegistry\(\{/u);
  assert.match(data, /actorProfileId/u);
  assert.match(data, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(data, /count: 'exact'/u);
  assert.match(
    data,
    /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: true \}\)/u,
  );
  assert.doesNotMatch(page, /ComingSoon|create|update|delete|document request/iu);
  assert.doesNotMatch(data, /passport_no_encrypted|visa_no_encrypted|emirates_id_encrypted/iu);
});
