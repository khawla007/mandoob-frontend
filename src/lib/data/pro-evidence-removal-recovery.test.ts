import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const PRO = '20000000-0000-4000-8000-000000000002';
const CREDENTIAL = '30000000-0000-4000-8000-000000000003';
const EVIDENCE = '40000000-0000-4000-8000-000000000004';
const RECOVERY = '50000000-0000-4000-8000-000000000005';
const PATH = `pro-credentials/${PRO}/${CREDENTIAL}/${EVIDENCE}`;
const mask = {
  credentialId: CREDENTIAL,
  type: 'pro_license' as const,
  maskedIdentifier: '•••• 1234',
  issuingAuthority: null,
  issueDate: null,
  expiryDate: null,
  state: 'draft' as const,
  version: 2,
  evidenceCount: 0,
  submittedAt: null,
  supersedesCredentialId: null,
};

test('recovery worker claims, removes exact private object, then finalizes without returning path', async () => {
  const { recoverAbandonedProCredentialEvidence } = await import('./pro-evidence-removal-recovery');
  const calls: string[] = [];
  const result = await recoverAbandonedProCredentialEvidence(
    { actorId: ACTOR, proProfileId: PRO, credentialId: CREDENTIAL, evidenceId: EVIDENCE },
    {
      operationId: () => RECOVERY,
      claim: async (input) => {
        calls.push('claim');
        assert.deepEqual(input, {
          actorId: ACTOR,
          proProfileId: PRO,
          credentialId: CREDENTIAL,
          evidenceId: EVIDENCE,
          recoveryOperationId: RECOVERY,
        });
        return {
          status: 'recovering' as const,
          recoveryOperationId: RECOVERY,
          credentialId: CREDENTIAL,
          evidenceId: EVIDENCE,
          storagePath: PATH,
        };
      },
      erase: async (path) => {
        calls.push('erase');
        assert.equal(path, PATH);
      },
      finalize: async (input) => {
        calls.push('finalize');
        assert.equal(input.recoveryOperationId, RECOVERY);
        return mask;
      },
      timeoutMs: 100,
    },
  );
  assert.deepEqual(calls, ['claim', 'erase', 'finalize']);
  assert.deepEqual(result, mask);
  assert.doesNotMatch(JSON.stringify(result), /storage|pro-credentials/u);
});

test('storage failure or bounded wait leaves claim unfinalized and returns one retryable error', async () => {
  const { recoverAbandonedProCredentialEvidence } = await import('./pro-evidence-removal-recovery');
  for (const erase of [
    async () => {
      throw new Error('private provider output');
    },
    async () => await new Promise<void>(() => undefined),
  ]) {
    let finalized = 0;
    await assert.rejects(
      () =>
        recoverAbandonedProCredentialEvidence(
          { actorId: ACTOR, proProfileId: PRO, credentialId: CREDENTIAL, evidenceId: EVIDENCE },
          {
            operationId: () => RECOVERY,
            claim: async () => ({
              status: 'recovering' as const,
              recoveryOperationId: RECOVERY,
              credentialId: CREDENTIAL,
              evidenceId: EVIDENCE,
              storagePath: PATH,
            }),
            erase,
            finalize: async () => {
              finalized += 1;
              return mask;
            },
            timeoutMs: 2,
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'RECOVERY_RETRYABLE' &&
        !error.message.includes('provider'),
    );
    assert.equal(finalized, 0);
  }
});

test('claim/finalize DAL uses exact target and fence arguments and sanitizes errors', async () => {
  const {
    claimProCredentialEvidenceRemovalRecovery,
    finalizeProCredentialEvidenceRemovalRecovery,
  } = await import('./pro-evidence-removal-recovery');
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return name.startsWith('claim_')
        ? {
            data: {
              status: 'recovering',
              recoveryOperationId: RECOVERY,
              credentialId: CREDENTIAL,
              evidenceId: EVIDENCE,
              storagePath: PATH,
            },
            error: null,
          }
        : { data: mask, error: null };
    },
  };
  const input = {
    actorId: ACTOR,
    proProfileId: PRO,
    credentialId: CREDENTIAL,
    evidenceId: EVIDENCE,
    recoveryOperationId: RECOVERY,
  };
  await claimProCredentialEvidenceRemovalRecovery(input, { supabase });
  await finalizeProCredentialEvidenceRemovalRecovery(input, { supabase });
  assert.deepEqual(calls, [
    {
      name: 'claim_pro_credential_evidence_removal_recovery',
      args: {
        p_actor_id: ACTOR,
        p_pro_profile_id: PRO,
        p_credential_id: CREDENTIAL,
        p_evidence_id: EVIDENCE,
        p_recovery_operation_id: RECOVERY,
      },
    },
    {
      name: 'finalize_pro_credential_evidence_removal_recovery',
      args: {
        p_actor_id: ACTOR,
        p_pro_profile_id: PRO,
        p_credential_id: CREDENTIAL,
        p_evidence_id: EVIDENCE,
        p_recovery_operation_id: RECOVERY,
      },
    },
  ]);

  for (const [message, code, status] of [
    ['NOT_FOUND', 'NOT_FOUND', 404],
    ['EVIDENCE_REMOVAL_LEASE_ACTIVE', 'EVIDENCE_REMOVAL_LEASE_ACTIVE', 409],
    ['EVIDENCE_REMOVAL_CLAIM_LOST', 'EVIDENCE_REMOVAL_CLAIM_LOST', 409],
    ['private database output', 'INTERNAL', 500],
  ] as const) {
    await assert.rejects(
      () =>
        claimProCredentialEvidenceRemovalRecovery(input, {
          supabase: { rpc: async () => ({ data: null, error: { message } }) },
        }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        'status' in error &&
        error.code === code &&
        error.status === status &&
        !error.message.includes('private database'),
    );
  }
});
