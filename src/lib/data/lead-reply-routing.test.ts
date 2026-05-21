import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadRouting() {
  return import('./lead-reply-routing');
}

type Row = Record<string, unknown>;

function createSupabaseStub(
  seed: Record<string, Row[]>,
  insertErrors: Record<string, string> = {},
) {
  const tables = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));

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
    tables,
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        orderKey: string | null;
        ascending: boolean;
      } = {
        filters: {},
        orderKey: null,
        ascending: true,
      };
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return builder;
        },
        order(key: string, opts?: { ascending?: boolean }) {
          state.orderKey = key;
          state.ascending = opts?.ascending ?? true;
          return builder;
        },
        limit: () => builder,
        insert(payload: Row) {
          if (insertErrors[table]) {
            return { error: { message: insertErrors[table] } };
          }
          rows(table).push({ id: `${table}-${rows(table).length + 1}`, ...payload });
          return { error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          let result = filterRows(table, state.filters);
          if (state.orderKey) {
            result = [...result].sort((a, b) => {
              const av = String(a[state.orderKey!] ?? '');
              const bv = String(b[state.orderKey!] ?? '');
              return state.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          resolve({ data: result, error: null });
        },
      };
      return builder;
    },
  };
}

const baseLead = {
  id: 'lead-1',
  tenant_id: 'tenant-1',
  name: 'Aisha Khan',
  email: 'aisha@example.com',
  phone: '+971 50 123 4567',
  stage: 'new',
  created_at: '2026-05-01T00:00:00.000Z',
};

test('routes inbound replies to a same-tenant lead by normalized phone', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({ leads: [baseLead], lead_events: [] });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'whatsapp',
      inboxId: 1,
      fromPhone: '971501234567',
      body: 'I am interested',
      providerMessageId: 'wamid-1',
      receivedAt: '2026-05-21T10:00:00.000Z',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'routed');
  assert.equal(supabase.tables.get('lead_events')![0].lead_id, 'lead-1');
  assert.equal(supabase.tables.get('lead_events')![0].event_type, 'inbound_reply');
  assert.deepEqual(
    (supabase.tables.get('lead_events')![0].metadata as Record<string, unknown>).candidate_lead_ids,
    [],
  );
});

test('matches UAE local phone numbers against provider country-code format', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    leads: [{ ...baseLead, phone: '050 123 4567' }],
    lead_events: [],
  });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'whatsapp',
      inboxId: 7,
      fromPhone: '971501234567',
      body: 'Local format match',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'routed');
  assert.equal(supabase.tables.get('lead_events')![0].lead_id, 'lead-1');
});

test('does not route replies across tenants with the same phone', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    leads: [{ ...baseLead, tenant_id: 'tenant-2' }],
    lead_events: [],
  });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'sms',
      inboxId: 2,
      fromPhone: '+971501234567',
      body: 'Hello',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'unmatched');
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});

test('prefers newest open lead over closed leads and records ambiguity metadata', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    leads: [
      {
        ...baseLead,
        id: 'lead-old-open',
        stage: 'contacted',
        created_at: '2026-05-02T00:00:00.000Z',
      },
      { ...baseLead, id: 'lead-new-closed', stage: 'won', created_at: '2026-05-20T00:00:00.000Z' },
      {
        ...baseLead,
        id: 'lead-new-open',
        stage: 'qualified',
        created_at: '2026-05-10T00:00:00.000Z',
      },
    ],
    lead_events: [],
  });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'whatsapp',
      inboxId: 'wa-inbox-3',
      fromPhone: '+971501234567',
      body: 'Can we talk?',
    },
    { supabase: supabase as never },
  );

  assert.deepEqual(result, {
    status: 'routed',
    leadId: 'lead-new-open',
    ambiguous: true,
    candidateLeadIds: ['lead-new-open', 'lead-old-open', 'lead-new-closed'],
  });
  assert.deepEqual(
    (supabase.tables.get('lead_events')![0].metadata as Record<string, unknown>).candidate_lead_ids,
    ['lead-new-open', 'lead-old-open', 'lead-new-closed'],
  );
});

test('unmatched replies create no lead event', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({ leads: [baseLead], lead_events: [] });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'sms',
      inboxId: 4,
      fromPhone: '+971509999999',
      body: 'Wrong number',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'unmatched');
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});

test('finds older same-tenant phone matches beyond the newest 250 leads', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const fillerLeads = Array.from({ length: 300 }, (_, index) => ({
    ...baseLead,
    id: `lead-filler-${index}`,
    phone: `+97150999${String(index).padStart(4, '0')}`,
    created_at: `2026-05-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const supabase = createSupabaseStub({
    leads: [
      ...fillerLeads,
      { ...baseLead, id: 'lead-old-match', created_at: '2026-01-01T00:00:00.000Z' },
    ],
    lead_events: [],
  });

  const result = await routeInboundReplyToLead(
    {
      tenantId: 'tenant-1',
      channel: 'sms',
      inboxId: 6,
      fromPhone: '+971501234567',
      body: 'Old lead still matches',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'routed');
  assert.equal(supabase.tables.get('lead_events')![0].lead_id, 'lead-old-match');
});

test('safe routing wrapper swallows routing failures', async () => {
  const { routeInboundReplyToLeadSafely } = await loadRouting();
  const supabase = createSupabaseStub(
    { leads: [baseLead], lead_events: [] },
    { lead_events: 'boom' },
  );

  const result = await routeInboundReplyToLeadSafely(
    {
      tenantId: 'tenant-1',
      channel: 'sms',
      inboxId: 5,
      fromPhone: '+971501234567',
      body: 'Still log inbox',
    },
    { supabase: supabase as never },
  );

  assert.equal(result.status, 'unmatched');
});

test('provider retries do not duplicate inbound reply lead events', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({ leads: [baseLead], lead_events: [] });
  const input = {
    tenantId: 'tenant-1',
    channel: 'sms' as const,
    inboxId: 8,
    fromPhone: '+971501234567',
    body: 'Retry-safe reply',
    providerMessageId: 'sms-provider-1',
  };

  await routeInboundReplyToLead(input, { supabase: supabase as never });
  await routeInboundReplyToLead({ ...input, inboxId: 9 }, { supabase: supabase as never });

  assert.equal(supabase.tables.get('lead_events')!.length, 1);
});
