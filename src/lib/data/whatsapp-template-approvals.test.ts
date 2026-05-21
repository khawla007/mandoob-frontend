import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadApprovals() {
  return import('./whatsapp-template-approvals');
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

  function filterRows(table: string, filters: Record<string, unknown>, nullFilters: string[]) {
    return rows(table).filter((row) => {
      const matchesValues = Object.entries(filters).every(([key, value]) => row[key] === value);
      const matchesNulls = nullFilters.every((key) => row[key] === null);
      return matchesValues && matchesNulls;
    });
  }

  return {
    inserts,
    updates,
    tables,
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inFilters: Record<string, unknown[]>;
        nullFilters: string[];
      } = { filters: {}, inFilters: {}, nullFilters: [] };
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
        is(key: string, value: unknown) {
          if (value === null) state.nullFilters.push(key);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        insert(payload: Row) {
          inserts.push({ table, payload });
          const row = { id: `${table}-${inserts.length}`, ...payload };
          rows(table).push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        update(payload: Row) {
          updates.push({ table, payload, filters: { ...state.filters } });
          filterRows(table, state.filters, state.nullFilters).forEach((row) =>
            Object.assign(row, payload),
          );
          return builder;
        },
        async maybeSingle() {
          let result = filterRows(table, state.filters, state.nullFilters);
          for (const [key, allowed] of Object.entries(state.inFilters)) {
            result = result.filter((row) => allowed.includes(row[key]));
          }
          return { data: result[0] ?? null, error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          let result = filterRows(table, state.filters, state.nullFilters);
          for (const [key, allowed] of Object.entries(state.inFilters)) {
            result = result.filter((row) => allowed.includes(row[key]));
          }
          resolve({ data: result, error: null });
        },
        async single() {
          let result = filterRows(table, state.filters, state.nullFilters);
          for (const [key, allowed] of Object.entries(state.inFilters)) {
            result = result.filter((row) => allowed.includes(row[key]));
          }
          const row = result[0] ?? null;
          return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
        },
      };
      return builder;
    },
  };
}

test('list returns registry templates as missing when no DB rows exist', async () => {
  const { listWhatsAppTemplateApprovals } = await loadApprovals();
  const supabase = createSupabaseStub({ whatsapp_template_approvals: [] });

  const rows = await listWhatsAppTemplateApprovals({}, { supabase: supabase as never });

  assert.ok(rows.length >= 5);
  assert.equal(rows.find((row) => row.templateId === 'renewal-reminder')?.status, 'missing');
  assert.equal(rows.find((row) => row.templateId === 'otp-code')?.category, 'authentication');
});

test('list applies DB rows over registry defaults and tenant overrides over globals', async () => {
  const { listWhatsAppTemplateApprovals } = await loadApprovals();
  const supabase = createSupabaseStub({
    whatsapp_template_approvals: [
      {
        id: 'global-1',
        tenant_id: null,
        template_id: 'renewal-reminder',
        meta_template_name: 'renewal_reminder',
        language: 'en',
        category: 'utility',
        status: 'approved',
        notes: 'global note',
        rejection_reason: null,
        submitted_at: '2026-05-01T00:00:00.000Z',
        last_checked_at: '2026-05-02T00:00:00.000Z',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
      {
        id: 'tenant-1',
        tenant_id: 'tenant-1',
        template_id: 'renewal-reminder',
        meta_template_name: 'renewal_reminder',
        language: 'en',
        category: 'utility',
        status: 'rejected',
        notes: 'tenant note',
        rejection_reason: 'Meta rejected copy',
        submitted_at: null,
        last_checked_at: '2026-05-03T00:00:00.000Z',
        created_at: '2026-05-03T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z',
      },
    ],
  });

  const rows = await listWhatsAppTemplateApprovals(
    { tenantId: 'tenant-1' },
    { supabase: supabase as never },
  );

  const renewal = rows.find((row) => row.templateId === 'renewal-reminder');
  assert.equal(renewal?.id, 'tenant-1');
  assert.equal(renewal?.scope, 'tenant');
  assert.equal(renewal?.status, 'rejected');
  assert.equal(renewal?.notes, 'tenant note');
  assert.equal(renewal?.rejectionReason, 'Meta rejected copy');
  assert.equal(renewal?.updatedAt, '2026-05-04T00:00:00.000Z');
});

test('update rejects non-platform-admin actor roles', async () => {
  const { updateWhatsAppTemplateApproval } = await loadApprovals();
  const supabase = createSupabaseStub({ whatsapp_template_approvals: [] });

  await assert.rejects(
    () =>
      updateWhatsAppTemplateApproval(
        { templateId: 'renewal-reminder', tenantId: null, status: 'approved' },
        { id: 'actor-1', role: 'pro' },
        { supabase: supabase as never },
      ),
    /platform admins/,
  );
  assert.equal(supabase.inserts.length, 0);
});

test('admin update upserts approval and writes tenant audit log for tenant scope', async () => {
  const { updateWhatsAppTemplateApproval } = await loadApprovals();
  const supabase = createSupabaseStub({
    whatsapp_template_approvals: [],
    tenant_audit_log: [],
  });

  await updateWhatsAppTemplateApproval(
    {
      templateId: 'document-requested',
      tenantId: 'tenant-1',
      status: 'pending',
      notes: '  ',
      rejectionReason: '  Waiting for Meta review  ',
      submittedAt: '2026-05-05T00:00:00.000Z',
      lastCheckedAt: '',
    },
    { id: 'actor-1', role: 'admin' },
    { supabase: supabase as never },
  );

  assert.equal(supabase.inserts[0].table, 'whatsapp_template_approvals');
  assert.equal(supabase.inserts[0].payload.tenant_id, 'tenant-1');
  assert.equal(supabase.inserts[0].payload.template_id, 'document-requested');
  assert.equal(supabase.inserts[0].payload.meta_template_name, 'document_requested');
  assert.equal(supabase.inserts[0].payload.category, 'utility');
  assert.equal(supabase.inserts[0].payload.status, 'pending');
  assert.equal(supabase.inserts[0].payload.notes, null);
  assert.equal(supabase.inserts[0].payload.rejection_reason, 'Waiting for Meta review');
  assert.equal(supabase.inserts[0].payload.updated_by, 'actor-1');
  assert.equal(supabase.inserts[1].table, 'tenant_audit_log');
  assert.equal(supabase.inserts[1].payload.action, 'whatsapp_template_status_updated');
  assert.equal(supabase.inserts[1].payload.tenant_id, 'tenant-1');
});

test('tenant update creates override instead of mutating global fallback row', async () => {
  const { updateWhatsAppTemplateApproval } = await loadApprovals();
  const supabase = createSupabaseStub({
    whatsapp_template_approvals: [
      {
        id: 'global-1',
        tenant_id: null,
        template_id: 'renewal-reminder',
        meta_template_name: 'renewal_reminder',
        language: 'en',
        category: 'utility',
        status: 'approved',
        notes: 'global approval',
        rejection_reason: null,
        submitted_at: null,
        last_checked_at: null,
        created_by: 'actor-0',
        updated_by: 'actor-0',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    ],
    tenant_audit_log: [],
  });

  await updateWhatsAppTemplateApproval(
    {
      templateId: 'renewal-reminder',
      tenantId: 'tenant-1',
      status: 'rejected',
      rejectionReason: 'Tenant-specific rejection',
    },
    { id: 'actor-1', role: 'super_admin' },
    { supabase: supabase as never },
  );

  const approvals = supabase.tables.get('whatsapp_template_approvals')!;
  assert.equal(approvals.find((row) => row.id === 'global-1')?.status, 'approved');
  assert.ok(
    approvals.some(
      (row) =>
        row.tenant_id === 'tenant-1' &&
        row.template_id === 'renewal-reminder' &&
        row.status === 'rejected',
    ),
  );
});
