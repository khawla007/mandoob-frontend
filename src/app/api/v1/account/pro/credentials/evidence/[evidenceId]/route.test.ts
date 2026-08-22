import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceDeleteHandler, createEvidenceGetHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const E = '40000000-0000-4000-8000-000000000004';

test('evidence GET requires a live owner/operator with AAL2 and signs for exactly 300 seconds', async () => {
  const calls: unknown[] = [];
  const handler = createEvidenceGetHandler({
    requireViewer: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    open: async () => ({
      evidence_id: E,
      pro_profile_id: A,
      credential_id: '20000000-0000-4000-8000-000000000002',
      storage_path: `pro-credentials/${A}/20000000-0000-4000-8000-000000000002/${E}`,
      mime_type: 'application/pdf',
      size_bytes: 5,
      original_name_safe: 'proof.pdf',
    }),
    sign: async (path, ttl) => {
      calls.push(path, ttl);
      return 'https://signed.invalid/token';
    },
  });
  const response = await handler(new Request('http://localhost/evidence'), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://signed.invalid/token');
  assert.equal(calls[1], 300);
});

test('evidence DELETE follows the state-changing security order and derives actor', async () => {
  const calls: string[] = [];
  let actor = '';
  const handler = createEvidenceDeleteHandler({
    guardCsrf: async () => (calls.push('csrf'), null),
    requirePro: async () => (
      calls.push('session'),
      { id: A, role: 'pro', tenantId: A, aal: 'aal2', mfaEnrolled: true, email: null }
    ),
    open: async () => (
      calls.push('target'),
      {
        evidence_id: E,
        pro_profile_id: A,
        credential_id: '20000000-0000-4000-8000-000000000002',
        storage_path: `pro-credentials/${A}/20000000-0000-4000-8000-000000000002/${E}`,
        mime_type: 'application/pdf',
        size_bytes: 5,
        original_name_safe: 'proof.pdf',
      }
    ),
    resolveTarget: async () => (
      calls.push('scope'),
      {
        proProfileId: A,
        credentialIds: ['20000000-0000-4000-8000-000000000002'],
        companyId: null,
        tenantSlug: null,
      }
    ),
    limit: async () => (calls.push('limit'), 'allowed'),
    remove: async (id) => {
      actor = id;
      calls.push('mutation');
      return { credentialId: '20000000-0000-4000-8000-000000000002' } as never;
    },
    erase: async () => {
      calls.push('storage-delete');
    },
    revalidate: () => {
      calls.push('revalidate');
    },
  });
  const response = await handler(
    new Request('http://localhost/evidence', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        operationId: '30000000-0000-4000-8000-000000000003',
      }),
    }),
    { params: Promise.resolve({ evidenceId: E }) },
  );
  assert.equal(response.status, 200);
  assert.equal(actor, A);
  assert.deepEqual(calls, [
    'csrf',
    'session',
    'target',
    'scope',
    'limit',
    'mutation',
    'storage-delete',
    'revalidate',
  ]);
});

test('evidence DELETE hides denied sessions and fails closed when authoritative scope cannot resolve', async () => {
  const request = new Request('http://localhost/evidence', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expectedVersion: 1,
      operationId: '30000000-0000-4000-8000-000000000003',
    }),
  });
  const denied = createEvidenceDeleteHandler({
    guardCsrf: async () => null,
    requirePro: async () => {
      throw new Error('inactive account');
    },
  });
  assert.equal(
    (await denied(request.clone(), { params: Promise.resolve({ evidenceId: E }) })).status,
    404,
  );

  const unresolved = createEvidenceDeleteHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro',
      tenantId: A,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    open: async () => ({
      evidence_id: E,
      pro_profile_id: A,
      credential_id: '20000000-0000-4000-8000-000000000002',
      storage_path: `pro-credentials/${A}/20000000-0000-4000-8000-000000000002/${E}`,
      mime_type: 'application/pdf',
      size_bytes: 5,
      original_name_safe: 'proof.pdf',
    }),
    resolveTarget: async () => null,
  });
  assert.equal(
    (await unresolved(request, { params: Promise.resolve({ evidenceId: E }) })).status,
    404,
  );
});

test('evidence GET rejects malformed IDs and hides unknown/cross-PRO existence and raw errors', async () => {
  const base = {
    requireViewer: async () => ({
      id: A,
      role: 'pro' as const,
      tenantId: A,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    open: async () => {
      throw new Error('private path');
    },
    sign: async () => 'https://signed.invalid',
  };
  for (const evidenceId of ['dirty', E]) {
    const response = await createEvidenceGetHandler(base)(
      new Request('http://localhost/evidence'),
      { params: Promise.resolve({ evidenceId }) },
    );
    assert.equal(response.status, evidenceId === 'dirty' ? 400 : 404);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private path|storage/iu);
  }
  const aal1 = createEvidenceGetHandler({
    ...base,
    requireViewer: async () => ({ ...(await base.requireViewer()), aal: 'aal1' }),
  });
  assert.equal(
    (
      await aal1(new Request('http://localhost/evidence'), {
        params: Promise.resolve({ evidenceId: E }),
      })
    ).status,
    403,
  );
});

test('evidence DELETE sanitizes stale, replay and unknown mutation errors', async () => {
  const { ApiError } = await import('@/lib/errors');
  for (const [error, status, code] of [
    [
      new ApiError('STALE_CREDENTIAL_VERSION', 'private stale detail', 409),
      409,
      'STALE_CREDENTIAL_VERSION',
    ],
    [new ApiError('OPERATION_REUSED', 'private replay detail', 409), 409, 'OPERATION_REUSED'],
    [new Error('private database detail'), 500, 'INTERNAL'],
  ] as const) {
    const handler = createEvidenceDeleteHandler({
      guardCsrf: async () => null,
      requirePro: async () => ({
        id: A,
        role: 'pro',
        tenantId: A,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      open: async () => ({
        evidence_id: E,
        pro_profile_id: A,
        credential_id: '20000000-0000-4000-8000-000000000002',
        storage_path: `pro-credentials/${A}/20000000-0000-4000-8000-000000000002/${E}`,
        mime_type: 'application/pdf',
        size_bytes: 5,
        original_name_safe: 'proof.pdf',
      }),
      resolveTarget: async () => ({
        proProfileId: A,
        credentialIds: ['20000000-0000-4000-8000-000000000002'],
      }),
      limit: async () => 'allowed',
      remove: async () => {
        throw error;
      },
      erase: async () => undefined,
      revalidate: () => undefined,
    });
    const response = await handler(
      new Request('http://localhost/evidence', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          operationId: '30000000-0000-4000-8000-000000000003',
        }),
      }),
      { params: Promise.resolve({ evidenceId: E }) },
    );
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /private/iu);
  }
});
