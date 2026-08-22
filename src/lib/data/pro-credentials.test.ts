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
const EVIDENCE_ID = '55555555-5555-4555-8555-555555555555';

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

test('database invalid decision reason maps to the stable public code', async () => {
  const { reviewProCredential } = await import('./pro-credentials');
  const supabase = fake([{ data: null, error: { message: 'INVALID_DECISION_REASON' } }]);
  await assert.rejects(
    () =>
      reviewProCredential(
        ACTOR_ID,
        CREDENTIAL_ID,
        {
          command: 'reject',
          reasonCode: 'DOCUMENT_INVALID',
          reason: 'Document could not be verified',
          expectedVersion: 1,
          operationId: OPERATION_ID,
        },
        { supabase: supabase as never },
      ),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'DECISION_REASON_INVALID' &&
      !error.message.includes('INVALID_DECISION_REASON'),
  );
});

test('evidence removal prepare and finalize share exact replay arguments', async () => {
  const { prepareProCredentialEvidenceRemoval, finalizeProCredentialEvidenceRemoval } =
    await import('./pro-credentials');
  const prepared = {
    status: 'prepared',
    credentialId: CREDENTIAL_ID,
    evidenceId: EVIDENCE_ID,
    storagePath: `pro-credentials/${PRO_ID}/${CREDENTIAL_ID}/${EVIDENCE_ID}`,
  };
  const supabase = fake([
    { data: prepared, error: null },
    { data: mask, error: null },
  ]);
  assert.deepEqual(
    await prepareProCredentialEvidenceRemoval(
      ACTOR_ID,
      CREDENTIAL_ID,
      EVIDENCE_ID,
      1,
      OPERATION_ID,
      { supabase: supabase as never },
    ),
    prepared,
  );
  assert.deepEqual(
    await finalizeProCredentialEvidenceRemoval(
      ACTOR_ID,
      CREDENTIAL_ID,
      EVIDENCE_ID,
      1,
      OPERATION_ID,
      { supabase: supabase as never },
    ),
    mask,
  );
  assert.equal(supabase.calls[0]!.name, 'prepare_pro_credential_evidence_removal');
  assert.equal(supabase.calls[1]!.name, 'finalize_pro_credential_evidence_removal');
  assert.deepEqual(supabase.calls[0]!.args, supabase.calls[1]!.args);
  assert.match(String(supabase.calls[0]!.args.p_payload_hash), /^[a-f0-9]{64}$/u);
});

test('evidence removal protocol maps stale, replay and competing reservations', async () => {
  const { prepareProCredentialEvidenceRemoval } = await import('./pro-credentials');
  for (const [message, code] of [
    ['STALE_CREDENTIAL_VERSION', 'STALE_CREDENTIAL_VERSION'],
    ['OPERATION_REUSED', 'OPERATION_REUSED'],
    ['EVIDENCE_REMOVAL_IN_PROGRESS', 'EVIDENCE_REMOVAL_IN_PROGRESS'],
  ]) {
    const supabase = fake([{ data: null, error: { message } }]);
    await assert.rejects(
      () =>
        prepareProCredentialEvidenceRemoval(ACTOR_ID, CREDENTIAL_ID, EVIDENCE_ID, 1, OPERATION_ID, {
          supabase: supabase as never,
        }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === code,
    );
  }
});

test('evidence registration replay hash is stable across rescans of identical blob bytes', async () => {
  const { registerProCredentialEvidence } = await import('./pro-credentials');
  const supabase = fake([
    { data: mask, error: null },
    { data: mask, error: null },
  ]);
  for (const scanCompletedAt of ['2026-08-22T00:00:00.000Z', '2026-08-22T00:05:00.000Z']) {
    await registerProCredentialEvidence(
      ACTOR_ID,
      CREDENTIAL_ID,
      1,
      OPERATION_ID,
      EVIDENCE_ID,
      `pro-credentials/${PRO_ID}/${CREDENTIAL_ID}/${EVIDENCE_ID}`,
      {
        mimeType: 'application/pdf',
        sizeBytes: 8,
        sha256: 'a'.repeat(64),
        originalNameSafe: 'proof.pdf',
        scanProvider: 'fixture',
        scanCompletedAt,
      },
      { supabase: supabase as never },
    );
  }
  assert.equal(supabase.calls[0]!.args.p_payload_hash, supabase.calls[1]!.args.p_payload_hash);
  assert.notEqual(
    supabase.calls[0]!.args.p_scan_completed_at,
    supabase.calls[1]!.args.p_scan_completed_at,
  );
});
