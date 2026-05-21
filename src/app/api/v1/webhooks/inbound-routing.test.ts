import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.TWILIO_AUTH_TOKEN = 'twilio_token';
process.env.UNIFONIC_WEBHOOK_SECRET = 'unifonic_secret';
process.env.WHATSAPP_APP_SECRET = 'whatsapp_secret';

type Row = Record<string, unknown>;

function createWebhookSupabaseStub(provider: 'twilio' | 'unifonic' | 'whatsapp') {
  const tables = new Map<string, Row[]>([
    ['tenant_sms_config', [{ id: 'sms-config-1', tenant_id: 'tenant-1', provider, enabled: true }]],
    ['leads', [leadRow()]],
    ['lead_events', []],
    ['sms_inbox', []],
    ['whatsapp_inbox', []],
  ]);

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
          if (table === 'lead_events') return { error: { message: 'routing insert failed' } };
          const row = {
            id: `${table}-${rows(table).length + 1}`,
            received_at: '2026-05-21T10:00:00.000Z',
            ...payload,
          };
          rows(table).push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
            error: null,
          };
        },
        async maybeSingle() {
          return { data: filterRows(table, state.filters)[0] ?? null, error: null };
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

function leadRow(): Row {
  return {
    id: 'lead-1',
    tenant_id: 'tenant-1',
    name: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '+971501234567',
    stage: 'new',
    created_at: '2026-05-01T00:00:00.000Z',
  };
}

test('Twilio inbound logging survives lead routing failure', async () => {
  const { recordTwilioInbound } = await import('./twilio/route');
  const supabase = createWebhookSupabaseStub('twilio');

  await recordTwilioInbound(supabase as never, '+971501234567', 'I need help', 'twilio-message-1');

  assert.equal(supabase.tables.get('sms_inbox')!.length, 1);
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});

test('Unifonic inbound logging survives lead routing failure', async () => {
  const { recordUnifonicInbound } = await import('./unifonic/route');
  const supabase = createWebhookSupabaseStub('unifonic');

  await recordUnifonicInbound(
    supabase as never,
    '+971501234567',
    'I need help',
    'unifonic-message-1',
  );

  assert.equal(supabase.tables.get('sms_inbox')!.length, 1);
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});

test('WhatsApp inbound logging survives lead routing failure', async () => {
  const { recordWhatsAppInboundMessage } = await import('./whatsapp/route');
  const supabase = createWebhookSupabaseStub('whatsapp');

  await recordWhatsAppInboundMessage(supabase as never, 'tenant-1', {
    id: 'wamid-1',
    from: '+971501234567',
    type: 'text',
    text: { body: 'I need help' },
  });

  assert.equal(supabase.tables.get('whatsapp_inbox')!.length, 1);
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});
