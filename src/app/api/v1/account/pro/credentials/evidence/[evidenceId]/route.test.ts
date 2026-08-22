import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceDeleteHandler, createEvidenceGetHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const E = '40000000-0000-4000-8000-000000000004';
const C = '20000000-0000-4000-8000-000000000002';
const PATH = `pro-credentials/${A}/${C}/${E}`;
const prepared = () => ({
  status: 'prepared' as const,
  credentialId: C,
  evidenceId: E,
  storagePath: PATH,
});

test('evidence DELETE missing and mismatched CSRF touch no downstream stage', async () => {
  for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
    const touched: string[] = [];
    const handler = createEvidenceDeleteHandler({
      guardCsrf: async () => Response.json({ code }, { status: 403 }),
      requirePro: async () => {
        touched.push('session');
        throw new Error('must not run');
      },
      open: async () => {
        touched.push('target');
        throw new Error('must not run');
      },
      limit: async () => (touched.push('limit'), 'allowed'),
      prepare: async () => (touched.push('mutation'), prepared()),
      finalize: async () => (touched.push('mutation'), null),
    });
    const response = await handler(new Request('http://localhost/evidence', { method: 'DELETE' }), {
      params: Promise.resolve({ evidenceId: E }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(touched, []);
  }
});

test('evidence GET requires a live owner/operator with AAL2 and redirects to an opaque 300-second app token', async () => {
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
    issueToken: async (evidenceId, ttl) => {
      calls.push(evidenceId, ttl);
      return 'opaque-token';
    },
  });
  const response = await handler(new Request('http://localhost/evidence'), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get('location'),
    '/api/v1/account/pro/credentials/evidence/download?token=opaque-token',
  );
  assert.doesNotMatch(response.headers.get('location')!, /pro-credentials|10000000|20000000/iu);
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
    prepare: async () => {
      calls.push('prepare');
      return prepared();
    },
    finalize: async (id) => {
      actor = id;
      calls.push('finalize');
      return { credentialId: C } as never;
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
    'prepare',
    'storage-delete',
    'finalize',
    'revalidate',
  ]);
});

test('evidence DELETE keeps metadata on storage failure and retries missing-object cleanup before DAL mutation', async () => {
  let eraseAttempt = 0;
  let mutations = 0;
  const base = {
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: A,
      role: 'pro' as const,
      tenantId: A,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    open: async () => ({
      evidence_id: E,
      pro_profile_id: A,
      credential_id: '20000000-0000-4000-8000-000000000002',
      storage_path: `pro-credentials/${A}/20000000-0000-4000-8000-000000000002/${E}`,
      mime_type: 'application/pdf' as const,
      size_bytes: 5,
      original_name_safe: 'proof.pdf',
    }),
    resolveTarget: async () => ({
      proProfileId: A,
      credentialIds: ['20000000-0000-4000-8000-000000000002'],
    }),
    limit: async () => 'allowed' as const,
    erase: async () => {
      if (eraseAttempt++ === 0) throw new Error('private storage path');
    },
    prepare: async () => prepared(),
    finalize: async () => {
      mutations += 1;
      return { credentialId: E };
    },
    revalidate: () => undefined,
  };
  const makeRequest = () =>
    new Request('http://localhost/evidence', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        operationId: '30000000-0000-4000-8000-000000000003',
      }),
    });
  const handler = createEvidenceDeleteHandler(base);
  const failed = await handler(makeRequest(), { params: Promise.resolve({ evidenceId: E }) });
  assert.equal(failed.status, 503);
  assert.equal(mutations, 0);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /private|storage|path/iu);
  assert.equal(
    (await handler(makeRequest(), { params: Promise.resolve({ evidenceId: E }) })).status,
    200,
  );
  assert.equal(mutations, 1);
});

test('evidence DELETE DAL failure is not success and retry repeats idempotent storage removal', async () => {
  let removes = 0;
  let erases = 0;
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
    erase: async () => {
      erases += 1;
    },
    prepare: async () => prepared(),
    finalize: async () => {
      if (removes++ === 0) throw new Error('private dal');
      return { credentialId: E };
    },
    revalidate: () => undefined,
  });
  const makeRequest = () =>
    new Request('http://localhost/evidence', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        operationId: '30000000-0000-4000-8000-000000000003',
      }),
    });
  assert.equal(
    (await handler(makeRequest(), { params: Promise.resolve({ evidenceId: E }) })).status,
    500,
  );
  assert.equal(
    (await handler(makeRequest(), { params: Promise.resolve({ evidenceId: E }) })).status,
    200,
  );
  assert.equal(erases, 2);
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
    issueToken: async () => 'opaque',
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
    [
      new ApiError('EVIDENCE_REMOVAL_IN_PROGRESS', 'private competing detail', 409),
      409,
      'EVIDENCE_REMOVAL_IN_PROGRESS',
    ],
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
      prepare: async () => {
        throw error;
      },
      finalize: async () => ({ credentialId: C }),
      erase: async () => {
        throw new Error('storage must not be touched');
      },
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
