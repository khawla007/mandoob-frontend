import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const TERM_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';
const term = {
  termId: TERM_ID,
  termKind: 'pricing',
  model: 'per_registration',
  currency: 'AED',
  amountMinor: 12500,
  retainerInterval: null,
  scope: 'all_registrations',
  effectiveFrom: '2026-08-21',
  effectiveTo: null,
  status: 'draft',
  version: 1,
};

function fake(results: Array<{ data: unknown; error: { message?: string } | null }>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let index = 0;
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return results[index++]!;
    },
  };
}

test('reads sanitized term history with one authorized RPC', async () => {
  const { readProCommercialTerms } = await import('./pro-commercial-terms');
  const supabase = fake([{ data: [term], error: null }]);
  assert.deepEqual(
    await readProCommercialTerms(ACTOR_ID, PRO_ID, { supabase: supabase as never }),
    [term],
  );
  assert.deepEqual(supabase.calls, [
    {
      name: 'read_pro_commercial_terms',
      args: { p_actor_id: ACTOR_ID, p_pro_profile_id: PRO_ID },
    },
  ]);
});

test('creates AED terms in integer minor units with exact versioned RPC arguments', async () => {
  const { createProCommercialTermDraft, formatAedMinor } = await import('./pro-commercial-terms');
  const supabase = fake([{ data: term, error: null }]);
  const result = await createProCommercialTermDraft(
    ACTOR_ID,
    PRO_ID,
    {
      termKind: 'pricing',
      model: 'per_registration',
      currency: 'AED',
      amountMinor: 12500,
      retainerInterval: null,
      effectiveFrom: '2026-08-21',
      effectiveTo: null,
      operationId: OPERATION_ID,
    },
    { supabase: supabase as never },
  );
  assert.deepEqual(result, term);
  assert.equal(supabase.calls[0]!.name, 'create_pro_commercial_term_draft');
  assert.equal(supabase.calls[0]!.args.p_amount_minor, 12500);
  assert.match(String(supabase.calls[0]!.args.p_payload_hash), /^[a-f0-9]{64}$/u);
  assert.equal(formatAedMinor(12500, 'en'), 'AED 125.00');
});

test('rejects malformed term output and redacts unknown database errors', async () => {
  const { readProCommercialTerms } = await import('./pro-commercial-terms');
  for (const response of [
    { data: [{ ...term, amountMinor: 12.5 }], error: null },
    { data: null, error: { message: 'private terms table detail' } },
  ]) {
    const supabase = fake([response]);
    await assert.rejects(
      () => readProCommercialTerms(ACTOR_ID, PRO_ID, { supabase: supabase as never }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'INTERNAL' &&
        !error.message.includes('private'),
    );
  }
});
