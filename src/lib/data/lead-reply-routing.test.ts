import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadRouting() {
  return import('./lead-reply-routing');
}

type RpcResult = {
  status: 'routed' | 'unmatched';
  lead_id: string | null;
  ambiguous: boolean;
  candidate_lead_ids: string[];
};

function createSupabaseStub(result: RpcResult, errorMessage?: string) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    from() {
      throw new Error('routing must not use capped collection reads');
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return errorMessage
        ? { data: null, error: { message: errorMessage } }
        : { data: [result], error: null };
    },
  };
}

const input = {
  tenantId: '91800000-0000-4000-8000-000000000001',
  channel: 'sms' as const,
  inboxId: 8,
  operationKey: 'receipt-stable-1',
  fromPhone: '+971501234567',
  body: 'Retry-safe reply',
  providerMessageId: 'sms-provider-1',
  receivedAt: '2026-05-21T10:00:00.000Z',
};

test('routes through the bounded database RPC without collection reads', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    status: 'routed',
    lead_id: '91800000-0000-4000-8000-000000000050',
    ambiguous: false,
    candidate_lead_ids: ['91800000-0000-4000-8000-000000000050'],
  });

  const result = await routeInboundReplyToLead(input, { supabase: supabase as never });

  assert.deepEqual(result, {
    status: 'routed',
    leadId: '91800000-0000-4000-8000-000000000050',
    ambiguous: false,
    candidateLeadIds: ['91800000-0000-4000-8000-000000000050'],
  });
  assert.deepEqual(supabase.calls, [
    {
      name: 'route_inbound_reply_to_lead',
      args: {
        p_body: 'Retry-safe reply',
        p_channel: 'sms',
        p_from_phone: '+971501234567',
        p_inbox_id: '8',
        p_operation_key: 'receipt-stable-1',
        p_provider_message_id: 'sms-provider-1',
        p_received_at: '2026-05-21T10:00:00.000Z',
        p_tenant_id: '91800000-0000-4000-8000-000000000001',
      },
    },
  ]);
});

test('returns a lead found beyond the provider collection row cap', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    status: 'routed',
    lead_id: '91800000-0000-4000-8000-000000001501',
    ambiguous: false,
    candidate_lead_ids: ['91800000-0000-4000-8000-000000001501'],
  });

  const result = await routeInboundReplyToLead(input, { supabase: supabase as never });

  assert.equal(result.status, 'routed');
  assert.equal(
    result.status === 'routed' ? result.leadId : null,
    '91800000-0000-4000-8000-000000001501',
  );
  assert.equal(supabase.calls.length, 1);
});

test('replays an existing inbound event returned by the database RPC', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    status: 'routed',
    lead_id: '91800000-0000-4000-8000-000000000050',
    ambiguous: true,
    candidate_lead_ids: [
      '91800000-0000-4000-8000-000000000050',
      '91800000-0000-4000-8000-000000000051',
    ],
  });

  assert.deepEqual(await routeInboundReplyToLead(input, { supabase: supabase as never }), {
    status: 'routed',
    leadId: '91800000-0000-4000-8000-000000000050',
    ambiguous: true,
    candidateLeadIds: [
      '91800000-0000-4000-8000-000000000050',
      '91800000-0000-4000-8000-000000000051',
    ],
  });
});

test('preserves unmatched as a no-op result', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    status: 'unmatched',
    lead_id: null,
    ambiguous: false,
    candidate_lead_ids: [],
  });

  assert.deepEqual(await routeInboundReplyToLead(input, { supabase: supabase as never }), {
    status: 'unmatched',
  });
});

test('invalid sender phones remain unmatched without touching the database', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub({
    status: 'unmatched',
    lead_id: null,
    ambiguous: false,
    candidate_lead_ids: [],
  });

  const result = await routeInboundReplyToLead(
    { ...input, fromPhone: '---' },
    { supabase: supabase as never },
  );

  assert.deepEqual(result, { status: 'unmatched' });
  assert.equal(supabase.calls.length, 0);
});

test('routing infrastructure errors are sanitized', async () => {
  const { routeInboundReplyToLead } = await loadRouting();
  const supabase = createSupabaseStub(
    { status: 'unmatched', lead_id: null, ambiguous: false, candidate_lead_ids: [] },
    'duplicate key leaks private_table and tenant identity',
  );

  await assert.rejects(
    routeInboundReplyToLead(input, { supabase: supabase as never }),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : null, 'lead reply routing failed');
      return true;
    },
  );
});

test('normalizes supported UAE phone representations consistently', async () => {
  const { normalizePhoneForLeadMatch } = await loadRouting();
  assert.equal(normalizePhoneForLeadMatch('050 123 4567'), '971501234567');
  assert.equal(normalizePhoneForLeadMatch('00971 50 123 4567'), '971501234567');
  assert.equal(normalizePhoneForLeadMatch('+971501234567'), '971501234567');
  assert.equal(normalizePhoneForLeadMatch('---'), null);
});
