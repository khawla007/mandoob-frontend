import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.TWILIO_AUTH_TOKEN = 'twilio_token';
process.env.UNIFONIC_WEBHOOK_SECRET = 'unifonic_secret';
process.env.WHATSAPP_APP_SECRET = 'whatsapp_secret';

type Row = Record<string, unknown>;

const TENANT_ID = '00000000-0000-4000-8000-000000000003';
const DESTINATION_ID = '00000000-0000-4000-8000-000000000002';
const RECEIPT_ID = '00000000-0000-4000-8000-000000000001';

type ReservationRow = {
  receipt_id: string;
  destination_id: string;
  tenant_id: string;
  company_id: string | null;
};

function createWebhookSupabaseStub(
  provider: 'twilio' | 'unifonic' | 'whatsapp',
  reservations: Array<ReservationRow | null> = [reservationRow()],
) {
  const calls: string[] = [];
  const rpcArgs: Array<Record<string, unknown>> = [];
  const tables = new Map<string, Row[]>([
    [
      'tenant_sms_config',
      [
        { id: 'unsafe-first-config', tenant_id: 'wrong-tenant', provider, enabled: true },
        { id: 'sms-config-1', tenant_id: TENANT_ID, provider, enabled: true },
      ],
    ],
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
    calls,
    rpcArgs,
    tables,
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'reserve_inbound_webhook');
      calls.push('rpc:reserve_inbound_webhook');
      rpcArgs.push(args);
      const reservation = reservations.shift() ?? null;
      return {
        data: reservation ? [reservation] : [],
        error: null,
      };
    },
    from(table: string) {
      calls.push(`from:${table}`);
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

function reservationRow(): ReservationRow {
  return {
    receipt_id: RECEIPT_ID,
    destination_id: DESTINATION_ID,
    tenant_id: TENANT_ID,
    company_id: null,
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

function nowIso(): string {
  return new Date().toISOString();
}

test('Twilio reserves the callback destination before any tenant-scoped side effect', async () => {
  const { recordTwilioInbound } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('twilio');

  await recordTwilioInbound(supabase as never, {
    destinationKey: '+12025550123',
    fromPhone: '+971501234567',
    body: 'I need help',
    providerEventId: 'twilio-message-reserved',
    occurredAt: nowIso(),
    rawPayload: 'To=%2B12025550123&From=%2B971501234567&Body=I+need+help',
  });

  assert.equal(supabase.calls[0], 'rpc:reserve_inbound_webhook');
  assert.equal(supabase.calls.includes('from:tenant_sms_config'), false);
  assert.equal(supabase.tables.get('sms_inbox')!.length, 1);
  assert.equal(supabase.tables.get('sms_inbox')![0]?.tenant_id, TENANT_ID);
  assert.equal(supabase.tables.get('lead_events')!.length, 0);
});

test('unknown Twilio destination is a non-disclosing no-op', async () => {
  const { recordTwilioInbound } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('twilio', [null]);

  await recordTwilioInbound(supabase as never, {
    destinationKey: '+19999999999',
    fromPhone: '+971501234567',
    body: 'I need help',
    providerEventId: 'twilio-message-unknown',
    occurredAt: nowIso(),
    rawPayload: 'protected raw body',
  });

  assert.deepEqual(supabase.calls, ['rpc:reserve_inbound_webhook']);
  assert.equal(supabase.tables.get('sms_inbox')!.length, 0);
});

test('duplicate Unifonic provider event IDs are idempotent', async () => {
  const { recordUnifonicInbound } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('unifonic', [reservationRow(), null]);
  const input = {
    destinationKey: '971500001111',
    fromPhone: '+971501234567',
    body: 'I need help',
    providerEventId: 'unifonic-message-1',
    occurredAt: nowIso(),
    rawPayload: '{"MessageID":"unifonic-message-1"}',
  };

  await recordUnifonicInbound(supabase as never, input);
  await recordUnifonicInbound(supabase as never, input);

  assert.equal(supabase.tables.get('sms_inbox')!.length, 1);
  assert.equal(supabase.calls.filter((call) => call === 'rpc:reserve_inbound_webhook').length, 2);
});

test('stale and malformed provider timestamps fail closed before reservation', async () => {
  const { recordTwilioInbound } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('twilio');
  const baseInput = {
    destinationKey: '+12025550123',
    fromPhone: '+971501234567',
    body: 'I need help',
    providerEventId: 'twilio-message-stale',
    rawPayload: 'protected raw body',
  };

  await recordTwilioInbound(supabase as never, {
    ...baseInput,
    occurredAt: '2020-01-01T00:00:00.000Z',
  });
  await recordTwilioInbound(supabase as never, { ...baseInput, occurredAt: 'not-a-date' });

  assert.deepEqual(supabase.calls, []);
  assert.equal(supabase.tables.get('sms_inbox')!.length, 0);
});

test('WhatsApp resolves ownership through destination reservation and suppresses duplicates', async () => {
  const { recordWhatsAppInboundMessage } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('whatsapp', [reservationRow(), null]);
  const message = {
    id: 'wamid-1',
    from: '+971501234567',
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'text',
    text: { body: 'I need help' },
  };

  await recordWhatsAppInboundMessage(supabase as never, 'meta-phone-number-id', message, '{}');
  await recordWhatsAppInboundMessage(supabase as never, 'meta-phone-number-id', message, '{}');

  assert.equal(supabase.tables.get('whatsapp_inbox')!.length, 1);
  assert.equal(supabase.tables.get('whatsapp_inbox')![0]?.tenant_id, TENANT_ID);
  assert.equal(supabase.calls.includes('from:tenant_whatsapp_config'), false);
});

test('reservation RPC receives only hashes, timestamp, provider, and verified-signature proof', async () => {
  const { recordTwilioInbound } = await import('./inbound-recording');
  const supabase = createWebhookSupabaseStub('twilio', [null]);

  await recordTwilioInbound(supabase as never, {
    destinationKey: '+12025550123',
    fromPhone: '+971501234567',
    body: 'private body',
    providerEventId: 'private-event-id',
    occurredAt: nowIso(),
    rawPayload: 'private raw payload',
  });

  const serialized = JSON.stringify(supabase.rpcArgs[0]);
  assert.equal(serialized.includes('+12025550123'), false);
  assert.equal(serialized.includes('private-event-id'), false);
  assert.equal(serialized.includes('private raw payload'), false);
  assert.match(String(supabase.rpcArgs[0]?.p_destination_key_hash), /^[a-f0-9]{64}$/);
  assert.match(String(supabase.rpcArgs[0]?.p_provider_event_id_hash), /^[a-f0-9]{64}$/);
  assert.match(String(supabase.rpcArgs[0]?.p_payload_hash), /^[a-f0-9]{64}$/);
  assert.equal(supabase.rpcArgs[0]?.p_signature_verified, true);
});
