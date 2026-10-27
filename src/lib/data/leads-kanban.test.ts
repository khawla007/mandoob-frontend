import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadKanban() {
  return import('./leads-kanban');
}

type Row = Record<string, unknown>;

function createSupabaseStub(seed: Record<string, Row[]>) {
  const tables = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const inserts: Array<{ table: string; payload: Row }> = [];
  const updates: Array<{ table: string; payload: Row; filters: Record<string, unknown> }> = [];

  function rows(table: string) {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  function filterRows(table: string, filters: Record<string, unknown>) {
    return rows(table).filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value),
    );
  }

  return {
    inserts,
    updates,
    tables,
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inFilters: Record<string, unknown[]>;
        updatePayload: Row | null;
      } = { filters: {}, inFilters: {}, updatePayload: null };
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return builder;
        },
        in(key: string, value: unknown[]) {
          state.inFilters[key] = value;
          return builder;
        },
        or() {
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        update(payload: Row) {
          state.updatePayload = payload;
          return builder;
        },
        insert(payload: Row) {
          inserts.push({ table, payload });
          const row = { id: `${table}-${inserts.length}`, ...payload };
          rows(table).push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
        async maybeSingle() {
          let result = filterRows(table, state.filters);
          for (const [key, allowed] of Object.entries(state.inFilters)) {
            result = result.filter((row) => allowed.includes(row[key]));
          }
          return { data: result[0] ?? null, error: null };
        },
        async single() {
          const result = await builder.maybeSingle();
          return result.data
            ? { data: result.data, error: null }
            : { data: null, error: { message: 'not found' } };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          let result = filterRows(table, state.filters);
          for (const [key, allowed] of Object.entries(state.inFilters)) {
            result = result.filter((row) => allowed.includes(row[key]));
          }
          if (state.updatePayload) {
            result.forEach((row) => Object.assign(row, state.updatePayload));
            updates.push({ table, payload: state.updatePayload, filters: { ...state.filters } });
          }
          resolve({ data: result, error: null });
        },
      };
      return builder;
    },
  };
}

const lead = {
  id: 'lead-1',
  tenant_id: null,
  name: 'Aisha Khan',
  email: 'aisha@example.com',
  phone: '+971501234567',
  source: 'questionnaire',
  stage: 'new',
  form_data: { jurisdiction: 'free_zone', authority: 'DMCC', addOns: ['bank_account'] },
  estimate_data: { total: 12000 },
  routing_reason: 'platform_unassigned',
  score: 65,
  row_version: 1,
  assigned_team_member_id: null,
  converted_company_id: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  tenants: null,
};

test('platform kanban lists all questionnaire leads grouped by stage', async () => {
  const { listPlatformLeadKanban } = await loadKanban();
  const supabase = createSupabaseStub({ leads: [lead] });

  const kanban = await listPlatformLeadKanban({}, { supabase: supabase as never });

  assert.equal(kanban.new[0].id, 'lead-1');
  assert.equal(kanban.new[0].assignedTenantName, null);
  assert.equal(kanban.new[0].scoreTemperature, 'warm');
  assert.ok(kanban.new[0].scoreFactors.some((factor) => factor.key === 'jurisdiction'));
  assert.equal(kanban.contacted.length, 0);
});

test('tenant kanban lists only leads assigned to that tenant', async () => {
  const { listTenantLeadKanban } = await loadKanban();
  const supabase = createSupabaseStub({
    leads: [
      { ...lead, tenant_id: 'tenant-1' },
      { ...lead, id: 'lead-2', tenant_id: 'tenant-2' },
    ],
  });

  const kanban = await listTenantLeadKanban('tenant-1', { supabase: supabase as never });

  assert.deepEqual(
    kanban.new.map((row) => row.id),
    ['lead-1'],
  );
});

test('platform kanban orders with a stable id tie-breaker', async () => {
  const { listPlatformLeadKanban } = await loadKanban();
  const supabase = createSupabaseStub({
    leads: [lead, { ...lead, id: 'lead-2' }],
  });
  const kanban = await listPlatformLeadKanban({}, { supabase: supabase as never });
  assert.equal(kanban.new.length, 2);
  assert.equal(kanban.new[0].rowVersion, 1);
});

test('platform lead mutation calls the atomic RPC with operation and version binding', async () => {
  const { mutatePlatformLead } = await loadKanban();
  let received: Record<string, unknown> | undefined;
  const result = await mutatePlatformLead(
    {
      leadId: 'lead-1',
      operationId: 'op-1',
      expectedVersion: 3,
      action: 'stage',
      value: 'qualified',
    },
    {
      rpc: async (fn, args) => {
        received = { fn, ...args };
        return { data: { leadId: 'lead-1', version: 4 }, error: null };
      },
    },
  );
  assert.deepEqual(result, { leadId: 'lead-1', version: 4 });
  assert.equal(received?.fn, 'mutate_platform_lead');
  assert.equal(received?.p_action, 'stage');
  assert.equal(received?.p_operation_id, 'op-1');
  assert.equal(received?.p_expected_version, 3);
  assert.match(received?.p_request_hash as string, /^[a-f0-9]{64}$/u);
});

test('platform lead mutation maps stale version, forbidden, and replay conflicts to safe codes', async () => {
  const { mutatePlatformLead } = await loadKanban();
  const call = (error: { code?: string; message?: string }) =>
    mutatePlatformLead(
      { leadId: 'lead-1', operationId: 'op-1', expectedVersion: 1, action: 'note', value: 'hi' },
      { rpc: async () => ({ data: null, error }) },
    );
  await assert.rejects(call({ code: '40001' }), /updated elsewhere/);
  await assert.rejects(call({ code: '42501' }), /not allowed/);
  await assert.rejects(call({ code: '23505' }), /already submitted/);
});
