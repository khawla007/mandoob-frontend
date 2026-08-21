import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '44444444-4444-4444-8444-444444444444';

const mask = {
  credentialId: CREDENTIAL_ID,
  type: 'pro_license',
  maskedIdentifier: '•••• 1234',
  issuingAuthority: 'Dubai Economy and Tourism',
  issueDate: '2026-01-01',
  expiryDate: '2027-01-01',
  state: 'draft',
  version: 1,
  evidenceCount: 0,
  submittedAt: null,
  supersedesCredentialId: null,
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

test('masked snapshot uses one aggregate RPC and rejects protected output', async () => {
  const { readProCredentialSnapshot } = await import('./pro-credentials');
  const supabase = fake([
    {
      data: {
        credentials: [mask],
        evidence: [
          {
            evidenceId: '55555555-5555-4555-8555-555555555555',
            credentialId: CREDENTIAL_ID,
            mimeType: 'application/pdf',
            sizeBytes: 1200,
            originalNameSafe: 'licence.pdf',
            createdAt: '2026-08-21T10:00:00.000Z',
          },
        ],
      },
      error: null,
    },
  ]);
  const result = await readProCredentialSnapshot(ACTOR_ID, PRO_ID, {
    supabase: supabase as never,
  });
  assert.equal(result.credentials[0]?.maskedIdentifier, '•••• 1234');
  assert.doesNotMatch(
    JSON.stringify(result),
    /identifierCiphertext|identifierHash|storagePath|AB-12-34/u,
  );
  assert.deepEqual(supabase.calls, [
    {
      name: 'read_pro_credential_snapshot',
      args: { p_actor_id: ACTOR_ID, p_pro_profile_id: PRO_ID },
    },
  ]);

  const unsafe = fake([
    { data: { credentials: [mask], evidence: [], storagePath: 'private' }, error: null },
  ]);
  await assert.rejects(
    () => readProCredentialSnapshot(ACTOR_ID, PRO_ID, { supabase: unsafe as never }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INTERNAL',
  );
});

test('draft save normalizes, encrypts and blind-indexes only inside exact RPC arguments', async () => {
  const { saveProCredentialDraft } = await import('./pro-credentials');
  const supabase = fake([{ data: mask, error: null }]);
  const result = await saveProCredentialDraft(
    ACTOR_ID,
    CREDENTIAL_ID,
    {
      identifier: ' ab-12 34 ',
      issuingAuthority: ' Dubai Economy and Tourism ',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      expectedVersion: 0,
      operationId: OPERATION_ID,
    },
    { supabase: supabase as never },
  );
  const args = supabase.calls[0]!.args;
  assert.equal(supabase.calls[0]!.name, 'save_pro_credential_draft');
  assert.equal(args.p_identifier_last4, '1234');
  assert.match(String(args.p_identifier_ciphertext), /^v1:/u);
  assert.match(String(args.p_identifier_hash), /^[a-f0-9]{64}$/u);
  assert.match(String(args.p_payload_hash), /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(args), /AB1234|ab-12 34/u);
  assert.deepEqual(result, mask);
  assert.doesNotMatch(JSON.stringify(result), /cipher|hash|AB1234/u);
});

test('credential errors and malformed RPC results are sanitized', async () => {
  const { createProCredentialDraft } = await import('./pro-credentials');
  for (const response of [
    { data: null, error: { message: 'private database output' } },
    { data: { ...mask, identifierHash: 'secret' }, error: null },
  ]) {
    const supabase = fake([response]);
    await assert.rejects(
      () =>
        createProCredentialDraft(ACTOR_ID, PRO_ID, OPERATION_ID, { supabase: supabase as never }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'INTERNAL' &&
        !error.message.includes('private'),
    );
  }
});
