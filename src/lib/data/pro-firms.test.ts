import assert from 'node:assert/strict';
import test from 'node:test';

import { getCompanyById, listCompanies, toCompanyRow } from './pro-firms';

test('maps a legal company workspace and its active PRO without tenant/firm ambiguity', () => {
  assert.deepEqual(
    toCompanyRow(
      {
        id: 'company-1',
        tenant_id: 'tenant-1',
        company_name: 'Acme Trading LLC',
        status: 'onboarding',
        trade_license_no: null,
        jurisdiction: 'Dubai Mainland',
        created_at: '2026-08-17T08:00:00.000Z',
        tenants: {
          slug: 'acme-trading',
          name: 'Acme Trading LLC',
          plan: 'starter',
          status: 'pending',
        },
      },
      {
        id: 'assignment-1',
        pro_profile_id: 'pro-1',
        profiles: { full_name: 'Aisha Khan' },
      },
    ),
    {
      id: 'company-1',
      tenantId: 'tenant-1',
      tenantSlug: 'acme-trading',
      workspaceName: 'Acme Trading LLC',
      plan: 'starter',
      tenantStatus: 'pending',
      companyName: 'Acme Trading LLC',
      companyStatus: 'onboarding',
      tradeLicenseNo: null,
      jurisdiction: 'Dubai Mainland',
      createdAt: '2026-08-17T08:00:00.000Z',
      currentAssignmentId: 'assignment-1',
      currentProProfileId: 'pro-1',
      currentProName: 'Aisha Khan',
    },
  );
});

test('maps an unassigned company with null PRO fields', () => {
  const row = toCompanyRow(
    {
      id: 'company-1',
      tenant_id: 'tenant-1',
      company_name: 'Acme Trading LLC',
      status: 'active',
      trade_license_no: 'TL-1',
      jurisdiction: null,
      created_at: '2026-08-17T08:00:00.000Z',
      tenants: {
        slug: 'acme-trading',
        name: 'Acme Trading LLC',
        plan: 'professional',
        status: 'active',
      },
    },
    null,
  );
  assert.equal(row.currentAssignmentId, null);
  assert.equal(row.currentProProfileId, null);
  assert.equal(row.currentProName, null);
});

function fakeCompanyClient(result: { data: unknown; error: unknown; count?: number | null }) {
  const calls: string[] = [];
  const chain = {
    select(_columns: string, options?: { count?: string }) {
      calls.push(`select:${options?.count ?? 'none'}`);
      return chain;
    },
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}:${String(value)}`);
      return chain;
    },
    ilike(column: string, value: string) {
      calls.push(`ilike:${column}:${value}`);
      return chain;
    },
    order(column: string, options: { ascending: boolean }) {
      calls.push(`order:${column}:${String(options.ascending)}`);
      return chain;
    },
    range(from: number, to: number) {
      calls.push(`range:${from}:${to}`);
      return Promise.resolve(result);
    },
    maybeSingle() {
      calls.push('maybeSingle');
      return Promise.resolve(result);
    },
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(`from:${table}`);
        return chain;
      },
    },
  };
}

test('company collection authorization fails before service-role reads', async () => {
  const fake = fakeCompanyClient({ data: [], error: null, count: 0 });
  await assert.rejects(() =>
    listCompanies(
      { page: 1, pageSize: 25 },
      {
        requireOperator: async () => {
          throw new Error('DENIED');
        },
        client: fake.client as never,
      },
    ),
  );
  assert.deepEqual(fake.calls, []);
});

test('company collection rejects an invalid tenant filter before service-role reads', async () => {
  const fake = fakeCompanyClient({ data: [], error: null, count: 0 });
  await assert.rejects(
    () =>
      listCompanies(
        { tenantId: 'not-a-uuid', page: 1, pageSize: 25 },
        { requireOperator: async () => undefined, client: fake.client as never },
      ),
    /Invalid company tenant filter/u,
  );
  assert.deepEqual(fake.calls, []);
});

test('company collection uses exact count and deterministic server range', async () => {
  const fake = fakeCompanyClient({ data: [], error: null, count: 61 });
  const page = await listCompanies(
    { status: 'active', q: 'Acme', page: 2, pageSize: 25 },
    { requireOperator: async () => undefined, client: fake.client as never },
  );
  assert.deepEqual(page, { rows: [], total: 61, page: 2, pageSize: 25, totalPages: 3 });
  assert.deepEqual(fake.calls, [
    'from:company_profiles',
    'select:exact',
    'eq:active_assignments.status:active',
    'eq:status:active',
    'ilike:company_name:%Acme%',
    'order:created_at:false',
    'order:id:false',
    'range:25:49',
  ]);
});

test('company detail authorization fails before service-role reads', async () => {
  const fake = fakeCompanyClient({ data: null, error: null });
  await assert.rejects(() =>
    getCompanyById('33333333-3333-4333-8333-333333333333', {
      requireOperator: async () => {
        throw new Error('DENIED');
      },
      client: fake.client as never,
    }),
  );
  assert.deepEqual(fake.calls, []);
});

test('company detail rejects an invalid identifier before service-role reads', async () => {
  const fake = fakeCompanyClient({ data: null, error: null });
  await assert.rejects(
    () =>
      getCompanyById('not-a-uuid', {
        requireOperator: async () => undefined,
        client: fake.client as never,
      }),
    /Invalid company identifier/u,
  );
  assert.deepEqual(fake.calls, []);
});
