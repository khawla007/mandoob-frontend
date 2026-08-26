import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const WORKER = '10000000-0000-4000-8000-000000000001';
const RESERVATION = '20000000-0000-4000-8000-000000000002';
const PRO = '30000000-0000-4000-8000-000000000003';
const CREDENTIAL = '40000000-0000-4000-8000-000000000004';
const EVIDENCE = '50000000-0000-4000-8000-000000000005';
const PATH = `pro-credentials/${PRO}/${CREDENTIAL}/${EVIDENCE}`;

test('upload cleanup worker removes exact claimed paths then finalizes a bounded batch', async () => {
  const { cleanupAbandonedProCredentialEvidenceUploads } =
    await import('./pro-evidence-upload-cleanup');
  const calls: string[] = [];
  const result = await cleanupAbandonedProCredentialEvidenceUploads({
    workerId: () => WORKER,
    batchSize: 2,
    claim: async (workerId, limit) => {
      assert.equal(workerId, WORKER);
      assert.equal(limit, 2);
      calls.push('claim');
      return [
        {
          reservationId: RESERVATION,
          recoveryOperationId: WORKER,
          proProfileId: PRO,
          credentialId: CREDENTIAL,
          evidenceId: EVIDENCE,
          storagePath: PATH,
        },
      ];
    },
    erase: async (path) => {
      calls.push('erase');
      assert.equal(path, PATH);
    },
    finalize: async (reservationId, workerId) => {
      calls.push('finalize');
      assert.equal(reservationId, RESERVATION);
      assert.equal(workerId, WORKER);
      return { status: 'cleaned' };
    },
    timeoutMs: 100,
  });
  assert.deepEqual(calls, ['claim', 'erase', 'finalize']);
  assert.deepEqual(result, { claimed: 1, cleaned: 1, referenced: 0, retryable: 0 });
  assert.doesNotMatch(JSON.stringify(result), /pro-credentials|storagePath|sha256/u);
});

test('upload cleanup keeps ambiguous storage or finalize outcomes retryable', async () => {
  const { cleanupAbandonedProCredentialEvidenceUploads } =
    await import('./pro-evidence-upload-cleanup');
  for (const failAt of ['erase', 'finalize'] as const) {
    const result = await cleanupAbandonedProCredentialEvidenceUploads({
      workerId: () => WORKER,
      claim: async () => [
        {
          reservationId: RESERVATION,
          recoveryOperationId: WORKER,
          proProfileId: PRO,
          credentialId: CREDENTIAL,
          evidenceId: EVIDENCE,
          storagePath: PATH,
        },
      ],
      erase: async () => {
        if (failAt === 'erase') throw new Error('raw storage error');
      },
      finalize: async () => {
        if (failAt === 'finalize') throw new Error('ambiguous database response');
        return { status: 'cleaned' as const };
      },
      timeoutMs: 10,
    });
    assert.deepEqual(result, { claimed: 1, cleaned: 0, referenced: 0, retryable: 1 });
  }
});

test('upload cleanup rejects forged claim paths without deletion or finalization', async () => {
  const { cleanupAbandonedProCredentialEvidenceUploads } =
    await import('./pro-evidence-upload-cleanup');
  let erased = 0;
  let finalized = 0;
  const result = await cleanupAbandonedProCredentialEvidenceUploads({
    workerId: () => WORKER,
    claim: async () => [
      {
        reservationId: RESERVATION,
        recoveryOperationId: WORKER,
        proProfileId: PRO,
        credentialId: CREDENTIAL,
        evidenceId: EVIDENCE,
        storagePath: 'pro-credentials/forged/path',
      },
    ],
    erase: async () => {
      erased += 1;
    },
    finalize: async () => {
      finalized += 1;
      return { status: 'cleaned' };
    },
  });
  assert.deepEqual(result, { claimed: 1, cleaned: 0, referenced: 0, retryable: 1 });
  assert.equal(erased, 0);
  assert.equal(finalized, 0);
});
