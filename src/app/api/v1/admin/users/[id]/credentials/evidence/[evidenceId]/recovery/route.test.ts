import assert from 'node:assert/strict';
import test from 'node:test';
import { JSON_BODY_MAX_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { ApiError } from '@/lib/errors';
import { createAdminEvidenceRecoveryPostHandler } from './route-handler';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const PRO = '20000000-0000-4000-8000-000000000002';
const CREDENTIAL = '30000000-0000-4000-8000-000000000003';
const EVIDENCE = '40000000-0000-4000-8000-000000000004';
const context = { params: Promise.resolve({ id: PRO, evidenceId: EVIDENCE }) };
const request = (body: unknown) =>
  new Request('http://localhost/admin/recovery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const operator = (aal: 'aal1' | 'aal2' = 'aal2') => ({
  id: ACTOR,
  role: 'admin' as const,
  tenantId: null,
  aal,
  mfaEnrolled: true,
  email: null,
});

test('recovery route enforces CSRF, live operator, AAL2, target, limit, bounded body and schema in order', async () => {
  const calls: string[] = [];
  const base = {
    guardCsrf: async () => (calls.push('csrf'), null),
    requireOperator: async () => (calls.push('session'), operator()),
    resolveTarget: async () => (
      calls.push('target'),
      { proProfileId: PRO, credentialIds: [CREDENTIAL] }
    ),
    limit: async () => (calls.push('limit'), 'allowed' as const),
    recover: async () => (calls.push('recover'), { credentialId: CREDENTIAL }),
    revalidate: async () => {
      calls.push('revalidate');
    },
  };
  const handler = createAdminEvidenceRecoveryPostHandler(base);
  const response = await handler(request({ credentialId: CREDENTIAL }), context);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['csrf', 'session', 'target', 'limit', 'recover', 'revalidate']);
  assert.doesNotMatch(JSON.stringify(await response.json()), /storage|pro-credentials/u);

  calls.length = 0;
  const oversized = request({ credentialId: CREDENTIAL });
  oversized.headers.set('content-length', String(JSON_BODY_MAX_BYTES + 1));
  const tooLarge = await handler(oversized, context);
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['csrf', 'session', 'target', 'limit']);
});

test('recovery route hides CSRF, wrong role, AAL1, unknown and cross-PRO targets without mutation', async () => {
  for (const scenario of ['csrf', 'session', 'aal', 'target', 'credential', 'limit'] as const) {
    let mutations = 0;
    const handler = createAdminEvidenceRecoveryPostHandler({
      guardCsrf: async () =>
        scenario === 'csrf' ? Response.json({ code: 'CSRF_REQUIRED' }, { status: 403 }) : null,
      requireOperator: async () => {
        if (scenario === 'session') throw new Error('private role');
        return operator(scenario === 'aal' ? 'aal1' : 'aal2');
      },
      resolveTarget: async () =>
        scenario === 'target' ? null : { proProfileId: PRO, credentialIds: [CREDENTIAL] },
      limit: async () => (scenario === 'limit' ? 'unavailable' : 'allowed'),
      recover: async () => {
        mutations += 1;
        return { credentialId: CREDENTIAL };
      },
      revalidate: () => undefined,
    });
    const body = { credentialId: scenario === 'credential' ? ACTOR : CREDENTIAL };
    const response = await handler(request(body), context);
    assert.equal(
      response.status,
      scenario === 'csrf' || scenario === 'aal' ? 403 : scenario === 'limit' ? 503 : 404,
    );
    assert.equal(mutations, 0);
  }
});

test('recovery route sanitizes retryable, claim, not-found and unknown worker errors', async () => {
  for (const [error, status, code] of [
    [new ApiError('NOT_FOUND', 'private evidence', 404), 404, 'NOT_FOUND'],
    [
      new ApiError('EVIDENCE_REMOVAL_LEASE_ACTIVE', 'private lease', 409),
      409,
      'EVIDENCE_REMOVAL_LEASE_ACTIVE',
    ],
    [new ApiError('RECOVERY_RETRYABLE', 'private provider', 503), 503, 'RECOVERY_RETRYABLE'],
    [new Error('private raw failure'), 500, 'INTERNAL'],
  ] as const) {
    const handler = createAdminEvidenceRecoveryPostHandler({
      guardCsrf: async () => null,
      requireOperator: async () => operator(),
      resolveTarget: async () => ({ proProfileId: PRO, credentialIds: [CREDENTIAL] }),
      limit: async () => 'allowed',
      recover: async () => {
        throw error;
      },
      revalidate: () => undefined,
    });
    const response = await handler(request({ credentialId: CREDENTIAL }), context);
    const payload = await response.json();
    assert.equal(response.status, status);
    assert.equal(payload.code, code);
    assert.doesNotMatch(JSON.stringify(payload), /private|provider|lease/u);
  }
});
