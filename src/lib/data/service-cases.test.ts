import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  createServiceCase,
  SERVICE_CASE_PAGE_SIZE,
  listServiceCaseWorkspace,
  listServiceCaseOwners,
  listServiceCases,
  rankServiceCases,
  toServiceCase,
  updateServiceCase,
} from './service-cases';

const TENANT_1 = '11111111-1111-4111-8111-111111111111';
const TENANT_2 = '22222222-2222-4222-8222-222222222222';
const CLIENT_1 = '33333333-3333-4333-8333-333333333333';
const CLIENT_2 = '44444444-4444-4444-8444-444444444444';
const PROFILE_1 = '55555555-5555-4555-8555-555555555555';
const PROFILE_2 = '66666666-6666-4666-8666-666666666666';
const CASE_1 = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;
type QueryCall = {
  table: string;
  operation: 'select' | 'insert' | 'update';
  filters: Array<{ kind: 'eq' | 'in'; key: string; value: unknown }>;
  payload?: Row;
  limit?: number;
  range?: [number, number];
  orders?: Array<{ key: string; ascending: boolean; nullsFirst?: boolean }>;
};

function fakeSupabase(
  seed: Record<string, Row[]>,
  failures: Record<string, { message: string; code?: string }> = {},
  rpcResults: Record<string, unknown> = {},
) {
  const tables = new Map(
    Object.entries(seed).map(([table, rows]) => [table, structuredClone(rows)]),
  );
  const calls: QueryCall[] = [];
  const rpcCalls: Array<{ name: string; args: Row }> = [];

  function tableRows(table: string): Row[] {
    const existing = tables.get(table);
    if (existing) return existing;
    const created: Row[] = [];
    tables.set(table, created);
    return created;
  }

  function from(table: string) {
    const state: {
      operation: QueryCall['operation'];
      filters: QueryCall['filters'];
      payload?: Row;
      selected?: string;
      limit?: number;
      range?: [number, number];
      exactCount?: boolean;
      orders: Array<{ key: string; ascending: boolean; nullsFirst?: boolean }>;
    } = { operation: 'select', filters: [], orders: [] };

    function filteredRows(): Row[] {
      return tableRows(table).filter((row) =>
        state.filters.every((filter) =>
          filter.kind === 'eq'
            ? row[filter.key] === filter.value
            : (filter.value as unknown[]).includes(row[filter.key]),
        ),
      );
    }

    function execute() {
      const failure = failures[`${table}:${state.operation}`];
      calls.push({
        table,
        operation: state.operation,
        filters: structuredClone(state.filters),
        ...(state.payload ? { payload: structuredClone(state.payload) } : {}),
        ...(state.limit === undefined ? {} : { limit: state.limit }),
        ...(state.range === undefined ? {} : { range: state.range }),
        ...(state.orders.length === 0 ? {} : { orders: structuredClone(state.orders) }),
      });
      if (failure) return { data: null, error: failure };

      if (state.operation === 'insert') {
        const inserted = {
          id: state.payload?.id ?? (table === 'service_cases' ? CASE_1 : `audit-${calls.length}`),
          ...state.payload,
        };
        tableRows(table).push(inserted);
        return { data: state.selected ? inserted : null, error: null };
      }

      if (state.operation === 'update') {
        const rows = filteredRows();
        rows.forEach((row) => Object.assign(row, state.payload));
        return { data: state.selected ? (rows[0] ?? null) : null, error: null };
      }

      const rows = filteredRows().sort((left, right) => {
        for (const order of state.orders) {
          const leftValue = left[order.key];
          const rightValue = right[order.key];
          if (leftValue === rightValue) continue;
          if (leftValue == null) return order.nullsFirst ? -1 : 1;
          if (rightValue == null) return order.nullsFirst ? 1 : -1;
          const comparison = leftValue < rightValue ? -1 : 1;
          return order.ascending ? comparison : -comparison;
        }
        return 0;
      });
      const data = state.range ? rows.slice(state.range[0], state.range[1] + 1) : rows;
      return { data, error: null, ...(state.exactCount ? { count: rows.length } : {}) };
    }

    const builder = {
      select(columns?: string, options?: { count?: string }) {
        state.selected = columns;
        state.exactCount = options?.count === 'exact';
        return builder;
      },
      eq(key: string, value: unknown) {
        state.filters.push({ kind: 'eq', key, value });
        return builder;
      },
      in(key: string, value: unknown[]) {
        state.filters.push({ kind: 'in', key, value });
        return builder;
      },
      order(key: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
        state.orders.push({
          key,
          ascending: options.ascending ?? true,
          ...(options.nullsFirst === undefined ? {} : { nullsFirst: options.nullsFirst }),
        });
        return builder;
      },
      limit(value: number) {
        state.limit = value;
        return builder;
      },
      range(from: number, to: number) {
        state.range = [from, to];
        return builder;
      },
      insert(payload: Row) {
        state.operation = 'insert';
        state.payload = payload;
        return builder;
      },
      update(payload: Row) {
        state.operation = 'update';
        state.payload = payload;
        return builder;
      },
      async maybeSingle() {
        const result = execute();
        return {
          ...result,
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        };
      },
      async single() {
        const result = execute();
        return {
          ...result,
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
        };
      },
      then(resolve: (result: { data: unknown; error: { message: string } | null }) => void) {
        resolve(execute());
      },
    };
    return builder;
  }

  async function rpc(name: string, args: Row) {
    rpcCalls.push({ name, args: structuredClone(args) });
    const error = failures[`rpc:${name}`] ?? null;
    const data = Object.hasOwn(rpcResults, name) ? rpcResults[name] : CASE_1;
    return { data: error ? null : data, error };
  }

  return { calls, from, rpc, rpcCalls, tables };
}

function caseRow(overrides: Row = {}): Row {
  return {
    id: CASE_1,
    tenant_id: TENANT_1,
    company_id: CLIENT_1,
    title: 'Trade license renewal',
    service_type: 'License renewal',
    status: 'documents_pending',
    priority: 'high',
    assigned_to: PROFILE_1,
    due_at: '2026-08-20T09:00:00.000Z',
    sla_due_at: '2026-08-15T09:00:00.000Z',
    blocked_reason: 'Waiting for passport copy',
    completed_at: null,
    created_at: '2026-08-11T09:00:00.000Z',
    updated_at: '2026-08-11T09:00:00.000Z',
    ...overrides,
  };
}

test('toServiceCase preserves tenant ownership and camel-cases every database field', () => {
  assert.deepEqual(toServiceCase(caseRow() as never), {
    id: CASE_1,
    tenantId: TENANT_1,
    companyId: CLIENT_1,
    title: 'Trade license renewal',
    serviceType: 'License renewal',
    status: 'documents_pending',
    priority: 'high',
    assignedTo: PROFILE_1,
    dueAt: '2026-08-20T09:00:00.000Z',
    slaDueAt: '2026-08-15T09:00:00.000Z',
    blockedReason: 'Waiting for passport copy',
    completedAt: null,
    createdAt: '2026-08-11T09:00:00.000Z',
    updatedAt: '2026-08-11T09:00:00.000Z',
  });
});

test('rankServiceCases orders breached SLA, priority, nearest SLA, null SLA, then ID', () => {
  const rows = [
    { id: 'z', priority: 'urgent', slaDueAt: null },
    { id: 'd', priority: 'urgent', slaDueAt: '2026-08-12T00:00:00.000Z' },
    { id: 'c', priority: 'normal', slaDueAt: '2026-08-10T00:00:00.000Z' },
    { id: 'b', priority: 'low', slaDueAt: '2026-08-09T00:00:00.000Z' },
    { id: 'a', priority: 'low', slaDueAt: '2026-08-09T00:00:00.000Z' },
  ];

  assert.deepEqual(
    rankServiceCases(rows, new Date('2026-08-11T00:00:00.000Z')).map((row) => row.id),
    ['c', 'a', 'b', 'd', 'z'],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['z', 'd', 'c', 'b', 'a'],
  );
});

test('listServiceCases scopes cases and filters, and only hydrates tenant-scoped related rows', async () => {
  const db = fakeSupabase({
    service_cases: [
      caseRow(),
      caseRow({ id: 'foreign-case', tenant_id: TENANT_2 }),
      caseRow({ id: 'foreign-client-case', company_id: CLIENT_2, assigned_to: PROFILE_2 }),
    ],
    company_profiles: [
      { id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' },
      { id: CLIENT_2, tenant_id: TENANT_2, company_name: 'Foreign LLC' },
    ],
    profiles: [
      {
        id: PROFILE_1,
        tenant_id: TENANT_1,
        full_name: 'Aisha Khan',
        role: 'pro',
        status: 'active',
      },
      {
        id: PROFILE_2,
        tenant_id: TENANT_2,
        full_name: 'Foreign Owner',
        role: 'pro',
        status: 'active',
      },
    ],
  });

  const rows = await listServiceCases(
    TENANT_1,
    { status: ['documents_pending'], assignedTo: PROFILE_1, companyId: CLIENT_1 },
    { supabase: db as never },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyName, 'Acme LLC');
  assert.equal(rows[0].ownerName, 'Aisha Khan');
  const casesCall = db.calls.find((call) => call.table === 'service_cases');
  assert.ok(
    casesCall?.filters.some(
      (f) => f.kind === 'eq' && f.key === 'tenant_id' && f.value === TENANT_1,
    ),
  );
  assert.ok(casesCall?.filters.some((f) => f.kind === 'in' && f.key === 'status'));
  assert.ok(casesCall?.filters.some((f) => f.key === 'assigned_to' && f.value === PROFILE_1));
  assert.ok(casesCall?.filters.some((f) => f.key === 'company_id' && f.value === CLIENT_1));
  for (const related of db.calls.filter(
    (call) => call.table === 'company_profiles' || call.table === 'profiles',
  )) {
    assert.ok(related.filters.some((f) => f.key === 'tenant_id' && f.value === TENANT_1));
  }
});

test('listServiceCases never hydrates cross-tenant client or owner names', async () => {
  const db = fakeSupabase({
    service_cases: [caseRow({ company_id: CLIENT_2, assigned_to: PROFILE_2 })],
    company_profiles: [{ id: CLIENT_2, tenant_id: TENANT_2, company_name: 'Foreign LLC' }],
    profiles: [
      {
        id: PROFILE_2,
        tenant_id: TENANT_2,
        full_name: 'Foreign Owner',
        role: 'pro',
        status: 'active',
      },
    ],
  });
  const [row] = await listServiceCases(TENANT_1, {}, { supabase: db as never });
  assert.equal(row.companyName, '');
  assert.equal(row.ownerName, null);
});

test('owner options include only active PRO firm owners', async () => {
  const db = fakeSupabase({
    profiles: [
      { id: PROFILE_1, tenant_id: TENANT_1, full_name: 'Owner', role: 'pro', status: 'active' },
      {
        id: PROFILE_2,
        tenant_id: TENANT_1,
        full_name: 'Employee',
        role: 'employee',
        status: 'active',
      },
      {
        id: 'inactive-pro',
        tenant_id: TENANT_1,
        full_name: 'Inactive',
        role: 'pro',
        status: 'suspended',
      },
    ],
  });

  assert.deepEqual(await listServiceCaseOwners(TENANT_1, { supabase: db as never }), [
    { id: PROFILE_1, name: 'Owner' },
  ]);
  const call = db.calls.find((candidate) => candidate.table === 'profiles');
  assert.ok(call?.filters.some((filter) => filter.key === 'role' && filter.value === 'pro'));
  assert.ok(call?.filters.some((filter) => filter.key === 'status' && filter.value === 'active'));
});

test('listServiceCases converts database and hydration errors to ApiError', async () => {
  const casesFailure = fakeSupabase({}, { 'service_cases:select': { message: 'db down' } });
  await assert.rejects(
    () => listServiceCases(TENANT_1, {}, { supabase: casesFailure as never }),
    (error) => error instanceof ApiError && error.code === 'INTERNAL',
  );

  const hydrationFailure = fakeSupabase(
    { service_cases: [caseRow()] },
    { 'company_profiles:select': { message: 'client lookup down' } },
  );
  await assert.rejects(
    () => listServiceCases(TENANT_1, {}, { supabase: hydrationFailure as never }),
    (error) => error instanceof ApiError && error.code === 'INTERNAL',
  );
});

test('listServiceCaseWorkspace loads each tenant dataset once without a silent row cap', async () => {
  const db = fakeSupabase({
    service_cases_ranked: [caseRow({ sla_breach_rank: 0, priority_rank: 1 })],
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' }],
    profiles: [
      {
        id: PROFILE_1,
        tenant_id: TENANT_1,
        full_name: 'Aisha Khan',
        role: 'pro',
        status: 'active',
      },
    ],
  });

  const workspace = await listServiceCaseWorkspace(
    TENANT_1,
    { status: ['documents_pending'] },
    { supabase: db as never },
  );

  assert.equal(workspace.cases[0].companyName, 'Acme LLC');
  assert.equal(workspace.cases[0].ownerName, 'Aisha Khan');
  assert.deepEqual(workspace.companies, [{ id: CLIENT_1, name: 'Acme LLC' }]);
  assert.deepEqual(workspace.owners, [{ id: PROFILE_1, name: 'Aisha Khan' }]);
  assert.equal(workspace.total, 1);
  assert.equal(workspace.page, 1);
  assert.equal(workspace.pageSize, SERVICE_CASE_PAGE_SIZE);
  assert.equal(db.calls.filter((call) => call.table === 'service_cases_ranked').length, 1);
  assert.equal(db.calls.filter((call) => call.table === 'company_profiles').length, 1);
  assert.equal(db.calls.filter((call) => call.table === 'profiles').length, 1);
  assert.equal(
    db.calls.some((call) => call.limit !== undefined),
    false,
  );
});

test('targeted service-case workspace uses a tenant-scoped exact id and first page', async () => {
  const db = fakeSupabase({
    service_cases_ranked: [
      caseRow({ id: CASE_1 }),
      caseRow({ id: '88888888-8888-4888-8888-888888888888' }),
    ],
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' }],
    profiles: [
      {
        id: PROFILE_1,
        tenant_id: TENANT_1,
        full_name: 'Aisha Khan',
        role: 'pro',
        status: 'active',
      },
    ],
  });

  const workspace = await listServiceCaseWorkspace(
    TENANT_1,
    { caseId: CASE_1, status: ['cancelled'], page: 99 },
    { supabase: db as never },
  );
  assert.deepEqual(
    workspace.cases.map((row) => row.id),
    [CASE_1],
  );
  assert.equal(workspace.page, 1);
  const query = db.calls.find((call) => call.table === 'service_cases_ranked');
  assert.ok(
    query?.filters.some((filter) => filter.key === 'tenant_id' && filter.value === TENANT_1),
  );
  assert.ok(query?.filters.some((filter) => filter.key === 'id' && filter.value === CASE_1));
  assert.ok(!query?.filters.some((filter) => filter.key === 'status'));
  assert.deepEqual(query?.range, [0, SERVICE_CASE_PAGE_SIZE - 1]);
});

test('exported service-case DAL uses explicit ranges instead of silent query limits', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/data/service-cases.ts'), 'utf8');
  assert.doesNotMatch(source, /\.limit\s*\(/);
  assert.match(source, /\.range\s*\(/);
});

test('service-case workspace pages cases and batches companies while honoring the sole active owner', async () => {
  const cases = Array.from({ length: 55 }, (_, index) =>
    caseRow({
      id: `case-${String(index).padStart(3, '0')}`,
      sla_breach_rank: 0,
      priority_rank: 1,
    }),
  );
  const companies = Array.from({ length: 1005 }, (_, index) => ({
    id: `client-${index}`,
    tenant_id: TENANT_1,
    company_name: `Client ${index}`,
  }));
  const profiles = Array.from({ length: 1005 }, (_, index) => ({
    id: `profile-${index}`,
    tenant_id: TENANT_1,
    full_name: `Owner ${index}`,
    role: 'pro',
    status: index === 0 ? 'active' : 'suspended',
  }));
  const db = fakeSupabase({ service_cases_ranked: cases, company_profiles: companies, profiles });

  const workspace = await listServiceCaseWorkspace(
    TENANT_1,
    { page: 2 },
    { supabase: db as never },
  );

  assert.equal(workspace.cases.length, 5);
  assert.equal(workspace.total, 55);
  assert.equal(workspace.page, 2);
  assert.equal(workspace.pageSize, 50);
  assert.equal(workspace.companies.length, 1005);
  assert.equal(workspace.owners.length, 1);
  assert.deepEqual(db.calls.find((call) => call.table === 'service_cases_ranked')?.range, [50, 99]);
  assert.deepEqual(
    db.calls.filter((call) => call.table === 'company_profiles').map((call) => call.range),
    [
      [0, 499],
      [500, 999],
      [1000, 1499],
    ],
  );
  assert.deepEqual(
    db.calls.filter((call) => call.table === 'profiles').map((call) => call.range),
    [[0, 499]],
  );
});

test('service-case workspace applies service type inside the tenant-scoped case query', async () => {
  const db = fakeSupabase({
    service_cases_ranked: [
      caseRow({ id: 'license-case', service_type: 'License' }),
      caseRow({ id: 'visa-case', service_type: 'Golden visa' }),
    ],
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' }],
    profiles: [],
  });

  const workspace = await listServiceCaseWorkspace(
    TENANT_1,
    { serviceType: 'Golden visa' },
    { supabase: db as never },
  );

  assert.deepEqual(
    workspace.cases.map((row) => row.id),
    ['visa-case'],
  );
  const query = db.calls.find((call) => call.table === 'service_cases_ranked');
  assert.ok(
    query?.filters.some((filter) => filter.key === 'tenant_id' && filter.value === TENANT_1),
  );
  assert.ok(
    query?.filters.some(
      (filter) => filter.key === 'service_type' && filter.value === 'Golden visa',
    ),
  );
});

test('service-case workspace applies global business ranking before the page boundary', async () => {
  const routine = Array.from({ length: 50 }, (_, index) =>
    caseRow({
      id: `routine-${String(index).padStart(2, '0')}`,
      priority: 'urgent',
      sla_due_at: '2099-01-01T00:00:00.000Z',
      sla_breach_rank: 1,
      priority_rank: 0,
      created_at: `2026-08-12T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    }),
  );
  const breached = caseRow({
    id: 'breached-old-case',
    priority: 'low',
    sla_due_at: '2020-01-01T00:00:00.000Z',
    sla_breach_rank: 0,
    priority_rank: 3,
    created_at: '2020-01-01T00:00:00.000Z',
  });
  const db = fakeSupabase({
    service_cases_ranked: [...routine, breached],
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' }],
    profiles: [
      {
        id: PROFILE_1,
        tenant_id: TENANT_1,
        full_name: 'Aisha Khan',
        role: 'pro',
        status: 'active',
      },
    ],
  });

  const firstPage = await listServiceCaseWorkspace(TENANT_1, {}, { supabase: db as never });
  const secondPage = await listServiceCaseWorkspace(
    TENANT_1,
    { page: 2 },
    { supabase: db as never },
  );
  assert.equal(firstPage.total, 51);
  assert.equal(firstPage.cases[0].id, 'breached-old-case');
  assert.equal(firstPage.cases.length, 50);
  assert.deepEqual(
    secondPage.cases.map((row) => row.id),
    ['routine-49'],
  );
  const rankedCall = db.calls.find((call) => call.table === 'service_cases_ranked');
  assert.deepEqual(rankedCall?.range, [0, 49]);
  assert.ok(
    rankedCall?.filters.some((filter) => filter.key === 'tenant_id' && filter.value === TENANT_1),
  );
  assert.deepEqual(rankedCall?.orders, [
    { key: 'sla_breach_rank', ascending: true },
    { key: 'priority_rank', ascending: true },
    { key: 'sla_due_at', ascending: true, nullsFirst: false },
    { key: 'id', ascending: true },
  ]);
});

test('service-case ranked read migration fixes global order and restricts the view', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260812091000_0051_service_case_ranked_read.sql'),
    'utf8',
  );
  assert.match(
    sql,
    /create or replace view public\.service_cases_ranked[\s\S]*security_invoker\s*=\s*true/i,
  );
  assert.match(sql, /case[\s\S]*sla_due_at < now\(\)[\s\S]*then 0[\s\S]*else 1/i);
  assert.match(
    sql,
    /case priority[\s\S]*when 'urgent' then 0[\s\S]*when 'high' then 1[\s\S]*when 'normal' then 2[\s\S]*when 'low' then 3/i,
  );
  assert.match(sql, /revoke all on public\.service_cases_ranked from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.service_cases_ranked to service_role/i);
});

test('listServiceCases deliberately batches beyond PostgREST max_rows', async () => {
  const cases = Array.from({ length: 1005 }, (_, index) =>
    caseRow({ id: `case-${String(index).padStart(4, '0')}` }),
  );
  const db = fakeSupabase({
    service_cases: cases,
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1, company_name: 'Acme LLC' }],
    profiles: [
      {
        id: PROFILE_1,
        tenant_id: TENANT_1,
        full_name: 'Aisha Khan',
        role: 'pro',
        status: 'active',
      },
    ],
  });

  assert.equal((await listServiceCases(TENANT_1, {}, { supabase: db as never })).length, 1005);
  assert.deepEqual(
    db.calls.filter((call) => call.table === 'service_cases').map((call) => call.range),
    [
      [0, 499],
      [500, 999],
      [1000, 1499],
    ],
  );
});

test('forward service-case security migration removes mutation RLS and guards both RPCs', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260812090000_0050_service_case_mutation_security.sql',
    ),
    'utf8',
  );
  assert.match(sql, /drop policy if exists service_cases_pro_write on public\.service_cases/i);
  assert.match(sql, /create policy service_cases_pro_read[\s\S]*for select/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*for (?:all|insert|update|delete)/i);
  assert.match(
    sql,
    /revoke insert, update, delete on table public\.service_cases from public, anon, authenticated/i,
  );

  for (const name of ['create_service_case_with_audit', 'update_service_case_with_audit']) {
    const start = sql.indexOf(`create or replace function public.${name}`);
    assert.notEqual(start, -1);
    const end = sql.indexOf('\n$$;', start);
    assert.notEqual(end, -1);
    const definition = sql.slice(start, end);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog, public/i);
    assert.match(
      definition,
      /from public\.tenants[\s\S]*id = p_tenant_id[\s\S]*status = 'active'[\s\S]*for share/i,
    );
    assert.match(
      definition,
      /from public\.profiles[\s\S]*id = p_actor_id[\s\S]*tenant_id = p_tenant_id[\s\S]*role = 'pro'[\s\S]*status = 'active'[\s\S]*for share/i,
    );
    assert.match(definition, /raise exception[\s\S]*FORBIDDEN/i);
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*from public`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`, 'i'),
    );
  }
});

test('createServiceCase rejects wrong roles and cross-tenant companies or assignees', async () => {
  const db = fakeSupabase({
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_2 }],
    profiles: [{ id: PROFILE_1, tenant_id: TENANT_2, role: 'pro', status: 'active' }],
  });
  const input = {
    company_id: CLIENT_1,
    title: 'New application',
    service_type: 'Visa application',
    assigned_to: PROFILE_1,
  };

  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'admin' as never }, input, {
        supabase: db as never,
      }),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
        supabase: db as never,
      }),
    (error) => error instanceof ApiError && error.code === 'INVALID_COMPANY',
  );

  db.tables.set('company_profiles', [{ id: CLIENT_1, tenant_id: TENANT_1 }]);
  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
        supabase: db as never,
      }),
    (error) => error instanceof ApiError && error.code === 'INVALID_ASSIGNEE',
  );

  db.tables.set('profiles', [
    { id: PROFILE_1, tenant_id: TENANT_1, role: 'employee', status: 'active' },
  ]);
  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
        supabase: db as never,
      }),
    (error) => error instanceof ApiError && error.code === 'INVALID_ASSIGNEE',
  );
});

test('createServiceCase uses the atomic RPC with trusted ownership and audit details', async () => {
  const db = fakeSupabase({
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1 }],
    profiles: [{ id: PROFILE_1, tenant_id: TENANT_1, role: 'pro', status: 'active' }],
    service_cases: [],
    tenant_audit_log: [],
  });

  assert.deepEqual(
    await createServiceCase(
      { tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' },
      {
        company_id: CLIENT_1,
        title: ' New application ',
        service_type: ' Visa application ',
        priority: 'urgent',
        assigned_to: PROFILE_1,
      },
      { supabase: db as never },
    ),
    { id: CASE_1 },
  );

  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'create_service_case_with_audit');
  assert.deepEqual(db.rpcCalls[0].args, {
    p_tenant_id: TENANT_1,
    p_actor_id: PROFILE_1,
    p_company_id: CLIENT_1,
    p_title: 'New application',
    p_service_type: 'Visa application',
    p_priority: 'urgent',
    p_assigned_to: PROFILE_1,
    p_due_at: null,
    p_sla_due_at: null,
    p_blocked_reason: null,
    p_changed_keys: ['company_id', 'title', 'service_type', 'priority', 'assigned_to'],
  });
  assert.equal(
    db.calls.some((call) => call.operation === 'insert'),
    false,
  );
});

test('createServiceCase treats an RPC error atomically and verifies the returned case ID', async () => {
  const seed = {
    company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1 }],
    service_cases: [],
    tenant_audit_log: [],
  };
  const input = { company_id: CLIENT_1, title: 'New case', service_type: 'Visa' };
  const dbFailure = fakeSupabase(seed, {
    'rpc:create_service_case_with_audit': { message: 'transaction rolled back' },
  });
  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
        supabase: dbFailure as never,
      }),
    (error) => error instanceof ApiError && error.code === 'INTERNAL',
  );
  assert.equal(
    dbFailure.calls.some((call) => call.operation === 'insert'),
    false,
  );

  const missingResult = fakeSupabase(seed, {}, { create_service_case_with_audit: null });
  await assert.rejects(
    () =>
      createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
        supabase: missingResult as never,
      }),
    (error) => error instanceof ApiError && error.code === 'INTERNAL',
  );
});

test('updateServiceCase rejects missing or cross-tenant cases and cross-tenant assignees', async () => {
  const db = fakeSupabase({
    service_cases: [caseRow({ tenant_id: TENANT_2 })],
    profiles: [{ id: PROFILE_2, tenant_id: TENANT_2, role: 'pro', status: 'active' }],
  });
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: db as never },
      ),
    (error) => error instanceof ApiError && error.code === 'NOT_FOUND',
  );

  db.tables.set('service_cases', [caseRow()]);
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { assigned_to: PROFILE_2 },
        { supabase: db as never },
      ),
    (error) => error instanceof ApiError && error.code === 'INVALID_ASSIGNEE',
  );
});

test('updateServiceCase denies a same-tenant case owned by another company', async () => {
  const db = fakeSupabase({
    service_cases: [caseRow({ tenant_id: TENANT_1, company_id: CLIENT_2 })],
  });

  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: db as never },
      ),
    (error) => error instanceof ApiError && error.code === 'NOT_FOUND',
  );
  assert.equal(db.rpcCalls.length, 0);
});

test('updateServiceCase merges current lifecycle and rejects an impossible persisted state', async () => {
  const db = fakeSupabase({
    service_cases: [caseRow({ status: 'completed', completed_at: null })],
  });
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: db as never },
      ),
    (error) => error instanceof ApiError && error.code === 'INVALID_LIFECYCLE',
  );
  assert.equal(
    db.calls.some((call) => call.operation === 'update'),
    false,
  );
});

test('updateServiceCase uses the atomic tenant-scoped RPC with only defined changed keys', async () => {
  const db = fakeSupabase({ service_cases: [caseRow()], tenant_audit_log: [] });
  await updateServiceCase(
    { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
    CASE_1,
    { priority: 'urgent', assigned_to: null },
    { supabase: db as never },
  );

  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'update_company_service_case_with_audit');
  assert.deepEqual(db.rpcCalls[0].args, {
    p_tenant_id: TENANT_1,
    p_company_id: CLIENT_1,
    p_actor_id: PROFILE_1,
    p_case_id: CASE_1,
    p_patch: { priority: 'urgent', assigned_to: null },
    p_changed_keys: ['priority', 'assigned_to'],
  });
  assert.equal(
    db.calls.some((call) => call.operation === 'update'),
    false,
  );
});

test('updateServiceCase treats RPC errors atomically and verifies affected row ID', async () => {
  const updateFailure = fakeSupabase(
    { service_cases: [caseRow()] },
    { 'rpc:update_company_service_case_with_audit': { message: 'transaction rolled back' } },
  );
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: updateFailure as never },
      ),
    ApiError,
  );

  const missingResult = fakeSupabase(
    { service_cases: [caseRow()], tenant_audit_log: [] },
    {},
    { update_company_service_case_with_audit: null },
  );
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: missingResult as never },
      ),
    ApiError,
  );
});

test('updateServiceCase preserves the atomic RPC not-found result', async () => {
  const db = fakeSupabase(
    { service_cases: [caseRow()] },
    { 'rpc:update_company_service_case_with_audit': { message: 'NOT_FOUND', code: 'P0002' } },
  );
  await assert.rejects(
    () =>
      updateServiceCase(
        { tenantId: TENANT_1, companyId: CLIENT_1, actorId: PROFILE_1, role: 'pro' },
        CASE_1,
        { priority: 'urgent' },
        { supabase: db as never },
      ),
    (error) => error instanceof ApiError && error.code === 'NOT_FOUND',
  );
});

test('service-case mutations preserve RPC authorization failures as forbidden', async () => {
  const input = { company_id: CLIENT_1, title: 'New case', service_type: 'Visa' };
  for (const failure of [{ message: 'FORBIDDEN', code: '42501' }, { message: 'FORBIDDEN' }]) {
    const db = fakeSupabase(
      { company_profiles: [{ id: CLIENT_1, tenant_id: TENANT_1 }] },
      { 'rpc:create_service_case_with_audit': failure },
    );
    await assert.rejects(
      () =>
        createServiceCase({ tenantId: TENANT_1, actorId: PROFILE_1, role: 'pro' }, input, {
          supabase: db as never,
        }),
      (error) => error instanceof ApiError && error.code === 'FORBIDDEN' && error.status === 403,
    );
  }
});

function auditActions(sql: string): string[] {
  const match = sql.match(
    /tenant_audit_log_action_check[\s\S]*?check\s*\(action\s+in\s*\(([\s\S]*?)\)\s*\)/i,
  );
  assert.ok(match, 'tenant audit action constraint is missing');
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

test('audit migration adds service-case actions without dropping any prior action', () => {
  const prior = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260528105942_0042_whatsapp_template_approvals.sql'),
    'utf8',
  );
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260811091000_0048_service_case_audit_actions.sql'),
    'utf8',
  );
  const priorActions = auditActions(prior);
  const nextActions = auditActions(migration);
  for (const action of priorActions)
    assert.ok(nextActions.includes(action), `missing prior action ${action}`);
  assert.ok(nextActions.includes('service_case_created'));
  assert.ok(nextActions.includes('service_case_updated'));
});

function assertMutationRpcContract(sql: string): void {
  for (const name of ['create_service_case_with_audit', 'update_service_case_with_audit']) {
    assert.match(sql, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}`, 'i'));
    assert.match(sql, new RegExp(`${name}[\\s\\S]*security definer`, 'i'));
    assert.match(sql, new RegExp(`${name}[\\s\\S]*set search_path = pg_catalog, public`, 'i'));
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*from public`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`, 'i'),
    );
  }
  assert.match(
    sql,
    /update public\.service_cases[\s\S]*where id = p_case_id[\s\S]*and tenant_id = p_tenant_id[\s\S]*returning id into v_case_id/i,
  );
  assert.match(sql, /if v_case_id is null then[\s\S]*raise exception[\s\S]*NOT_FOUND/i);
  assert.match(sql, /'service_case_created'/);
  assert.match(sql, /'service_case_updated'/);
  assert.match(
    sql,
    /jsonb_build_object\([\s\S]*'entity', 'service_case'[\s\S]*'id', v_case_id[\s\S]*'changed_keys'/i,
  );
}

test('service-case mutation RPC migration is transactional, restricted, and tenant-scoped', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260811092000_0049_service_case_mutation_rpcs.sql'),
    'utf8',
  );
  assertMutationRpcContract(sql);
});

test('service-case mutation RPC contract rejects weakened in-memory variants', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260811092000_0049_service_case_mutation_rpcs.sql'),
    'utf8',
  );
  assert.throws(() => assertMutationRpcContract(sql.replace(/and tenant_id = p_tenant_id/i, '')));
  assert.throws(() =>
    assertMutationRpcContract(sql.replace(/security definer/gi, 'security invoker')),
  );
  assert.throws(() =>
    assertMutationRpcContract(sql.replace(/to service_role/gi, 'to authenticated')),
  );
});
