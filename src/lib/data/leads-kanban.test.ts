import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
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
  assigned_team_member_id: null,
  converted_client_id: null,
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

  assert.deepEqual(kanban.new.map((row) => row.id), ['lead-1']);
});

test('assignment rejects inactive tenants', async () => {
  const { assignLeadToTenant } = await loadKanban();
  const supabase = createSupabaseStub({
    leads: [lead],
    tenants: [{ id: 'tenant-1', status: 'suspended', name: 'Paused PRO', slug: 'paused' }],
  });

  await assert.rejects(
    () => assignLeadToTenant('lead-1', 'tenant-1', 'actor-1', { supabase: supabase as never }),
    /active tenant/,
  );
});

test('assignment updates lead and records history plus tenant audit', async () => {
  const { assignLeadToTenant } = await loadKanban();
  const supabase = createSupabaseStub({
    leads: [lead],
    tenants: [{ id: 'tenant-1', status: 'active', name: 'Active PRO', slug: 'active' }],
    tenant_audit_log: [],
    lead_events: [],
  });

  await assignLeadToTenant('lead-1', 'tenant-1', 'actor-1', { supabase: supabase as never });

  assert.equal(supabase.tables.get('leads')![0].tenant_id, 'tenant-1');
  assert.equal(supabase.tables.get('leads')![0].routing_reason, 'assigned_by_platform');
  assert.equal(supabase.tables.get('lead_events')![0].event_type, 'lead_assigned');
  assert.equal(supabase.tables.get('tenant_audit_log')![0].action, 'lead_assigned');
});

test('stage changes reject invalid stages and cross-tenant writes', async () => {
  const { setLeadStage } = await loadKanban();
  const supabase = createSupabaseStub({ leads: [{ ...lead, tenant_id: 'tenant-1' }] });

  await assert.rejects(
    () =>
      setLeadStage(
        'lead-1',
        'converted' as never,
        { id: 'actor-1', role: 'pro', tenantId: 'tenant-1' },
        { supabase: supabase as never },
      ),
    /Invalid lead stage/,
  );

  await assert.rejects(
    () =>
      setLeadStage(
        'lead-1',
        'contacted',
        { id: 'actor-2', role: 'pro', tenantId: 'tenant-2' },
        { supabase: supabase as never },
      ),
    /different tenant/,
  );
});

test('stage changes update leads and record events', async () => {
  const { setLeadStage, addLeadNote } = await loadKanban();
  const supabase = createSupabaseStub({
    leads: [{ ...lead, tenant_id: 'tenant-1' }],
    lead_events: [],
    tenant_audit_log: [],
  });

  await setLeadStage(
    'lead-1',
    'qualified',
    { id: 'actor-1', role: 'pro', tenantId: 'tenant-1' },
    { supabase: supabase as never },
  );
  await addLeadNote(
    'lead-1',
    'Called founder and confirmed DMCC preference.',
    { id: 'actor-1', role: 'pro', tenantId: 'tenant-1' },
    { supabase: supabase as never },
  );

  assert.equal(supabase.tables.get('leads')![0].stage, 'qualified');
  assert.deepEqual(
    supabase.tables.get('lead_events')!.map((row) => row.event_type),
    ['lead_stage_changed', 'lead_note_added'],
  );
  assert.deepEqual(
    supabase.tables.get('tenant_audit_log')!.map((row) => row.action),
    ['lead_stage_changed', 'lead_note_added'],
  );
});
