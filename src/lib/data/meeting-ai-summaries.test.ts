import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadSummaries() {
  return import('./meeting-ai-summaries');
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

  function matches(row: Row, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([key, value]) => row[key] === value);
  }

  function applyFilters(table: string, filters: Record<string, unknown>, inFilters: Record<string, unknown[]>) {
    let result = rows(table).filter((row) => matches(row, filters));
    for (const [key, allowed] of Object.entries(inFilters)) {
      result = result.filter((row) => allowed.includes(row[key]));
    }
    return result;
  }

  return {
    inserts,
    updates,
    tables,
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inFilters: Record<string, unknown[]>;
        orderKey: string | null;
        ascending: boolean;
        limitCount: number | null;
        updatePayload: Row | null;
      } = { filters: {}, inFilters: {}, orderKey: null, ascending: true, limitCount: null, updatePayload: null };
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return builder;
        },
        in(key: string, values: unknown[]) {
          state.inFilters[key] = values;
          return builder;
        },
        order(key: string, opts?: { ascending?: boolean }) {
          state.orderKey = key;
          state.ascending = opts?.ascending ?? true;
          return builder;
        },
        limit(count: number) {
          state.limitCount = count;
          return builder;
        },
        update(payload: Row) {
          state.updatePayload = payload;
          return builder;
        },
        insert(payload: Row) {
          inserts.push({ table, payload });
          const row = {
            id: `${table}-${inserts.length}`,
            created_at: new Date(0).toISOString(),
            updated_at: new Date(0).toISOString(),
            ...payload,
          };
          rows(table).push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
        collect() {
          let result = applyFilters(table, state.filters, state.inFilters);
          if (state.updatePayload) {
            result.forEach((row) => Object.assign(row, state.updatePayload));
            updates.push({ table, payload: state.updatePayload, filters: { ...state.filters } });
          }
          if (state.orderKey) {
            result.sort((a, b) => {
              const av = String(a[state.orderKey!] ?? '');
              const bv = String(b[state.orderKey!] ?? '');
              return state.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          if (state.limitCount !== null) result = result.slice(0, state.limitCount);
          return { data: result, error: null };
        },
        async maybeSingle() {
          const result = builder.collect();
          return { data: result.data[0] ?? null, error: null };
        },
        async single() {
          const result = await builder.maybeSingle();
          return result.data ? { data: result.data, error: null } : { data: null, error: { message: 'not found' } };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          resolve(builder.collect());
        },
      };
      return builder;
    },
  };
}

const proActor = { id: 'pro-1', role: 'pro' as const, tenantId: 'tenant-1' };

test('ensurePendingMeetingAiSummary is idempotent per meeting', async () => {
  const { ensurePendingMeetingAiSummary } = await loadSummaries();
  const supabase = createSupabaseStub({
    meetings: [{ id: 'meeting-1', tenant_id: 'tenant-1', recording_storage_path: 'tenant-1/meetings/meeting-1/rec.mp4' }],
    meeting_ai_summaries: [],
  });

  const first = await ensurePendingMeetingAiSummary('meeting-1', { supabase: supabase as never });
  const second = await ensurePendingMeetingAiSummary('meeting-1', { supabase: supabase as never });

  assert.equal(first.id, second.id);
  assert.equal(supabase.tables.get('meeting_ai_summaries')!.length, 1);
  assert.equal(first.status, 'pending');
});

test('PRO can read own-tenant summary but cross-tenant reads are denied', async () => {
  const { getMeetingAiSummaryForMeeting } = await loadSummaries();
  const supabase = createSupabaseStub({
    meetings: [{ id: 'meeting-1', tenant_id: 'tenant-1' }],
    meeting_ai_summaries: [{ id: 'summary-1', meeting_id: 'meeting-1', tenant_id: 'tenant-1', status: 'completed' }],
  });

  const own = await getMeetingAiSummaryForMeeting('meeting-1', proActor, { supabase: supabase as never });
  assert.equal(own?.id, 'summary-1');

  await assert.rejects(
    () =>
      getMeetingAiSummaryForMeeting(
        'meeting-1',
        { id: 'pro-2', role: 'pro', tenantId: 'tenant-2' },
        { supabase: supabase as never },
      ),
    /different tenant/,
  );
});

test('pending summaries are claimed and marked processing before provider work', async () => {
  const { listPendingMeetingAiSummaries } = await loadSummaries();
  const supabase = createSupabaseStub({
    meeting_ai_summaries: [
      { id: 'summary-2', tenant_id: 'tenant-1', meeting_id: 'meeting-2', status: 'completed', created_at: '2026-05-10T02:00:00.000Z' },
      { id: 'summary-1', tenant_id: 'tenant-1', meeting_id: 'meeting-1', status: 'pending', attempts: 0, created_at: '2026-05-10T01:00:00.000Z' },
    ],
  });

  const pending = await listPendingMeetingAiSummaries(5, { supabase: supabase as never });

  assert.deepEqual(pending.map((row) => row.id), ['summary-1']);
  assert.equal(supabase.tables.get('meeting_ai_summaries')![1].status, 'processing');
  assert.equal(supabase.tables.get('meeting_ai_summaries')![1].attempts, 1);
});

test('summary completion stores validated action items and safe failure codes', async () => {
  const { completeMeetingAiSummary, failMeetingAiSummary } = await loadSummaries();
  const supabase = createSupabaseStub({
    meeting_ai_summaries: [{ id: 'summary-1', tenant_id: 'tenant-1', meeting_id: 'meeting-1', status: 'processing', attempts: 1 }],
  });

  await completeMeetingAiSummary(
    'summary-1',
    {
      transcriptText: 'Client asked about DMCC licensing.',
      summaryText: 'Client needs DMCC licensing support.',
      decisions: ['Proceed with DMCC estimate'],
      actionItems: [{ title: 'Send document checklist', owner_label: 'PRO', due_date: null, priority: 'high', source_quote: 'document checklist' }],
      risksOrFollowups: ['Confirm activity list'],
      language: 'en',
      provider: 'openai',
      model: 'gpt-4o-mini-transcribe',
    },
    { supabase: supabase as never },
  );

  assert.equal(supabase.tables.get('meeting_ai_summaries')![0].status, 'completed');
  assert.equal((supabase.tables.get('meeting_ai_summaries')![0].action_items as Row[])[0].title, 'Send document checklist');

  await failMeetingAiSummary('summary-1', 'PROVIDER_NOT_CONFIGURED', { supabase: supabase as never });
  assert.equal(supabase.tables.get('meeting_ai_summaries')![0].status, 'failed');
  assert.equal(supabase.tables.get('meeting_ai_summaries')![0].error_code, 'PROVIDER_NOT_CONFIGURED');
});

test('retryMeetingAiSummary only allows own-tenant PRO users', async () => {
  const { retryMeetingAiSummary } = await loadSummaries();
  const supabase = createSupabaseStub({
    meetings: [{ id: 'meeting-1', tenant_id: 'tenant-1' }],
    meeting_ai_summaries: [{ id: 'summary-1', tenant_id: 'tenant-1', meeting_id: 'meeting-1', status: 'failed', attempts: 2 }],
  });

  await retryMeetingAiSummary('meeting-1', proActor, { supabase: supabase as never });

  assert.equal(supabase.tables.get('meeting_ai_summaries')![0].status, 'pending');
  await assert.rejects(
    () =>
      retryMeetingAiSummary(
        'meeting-1',
        { id: 'pro-2', role: 'pro', tenantId: 'tenant-2' },
        { supabase: supabase as never },
      ),
    /different tenant/,
  );
});
