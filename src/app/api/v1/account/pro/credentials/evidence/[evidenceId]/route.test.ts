import assert from 'node:assert/strict';
import test from 'node:test';
import { JSON_BODY_MAX_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { PRO_CREDENTIAL_EVIDENCE_MAX_BYTES } from '@/lib/validation/pro-lifecycle';
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
const credential = {
  credentialId: C,
  type: 'pro_license' as const,
  maskedIdentifier: null,
  issuingAuthority: null,
  issueDate: null,
  expiryDate: null,
  state: 'draft' as const,
  version: 2,
  evidenceCount: 0,
  submittedAt: null,
  supersedesCredentialId: null,
};
const operationId = '30000000-0000-4000-8000-000000000003';

function removeRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/evidence', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credentialId: C, expectedVersion: 1, operationId, ...overrides }),
  });
}

function chunkedRemoveRequest(bytes: number) {
  return new Request('http://localhost/evidence', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(bytes));
      },
    }),
    duplex: 'half',
  } as RequestInit);
}

test('evidence DELETE missing and mismatched CSRF touch no downstream stage', async () => {
  for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
    const touched: string[] = [];
    const handler = createEvidenceDeleteHandler({
      guardCsrf: async () => Response.json({ code }, { status: 403 }),
      requirePro: async () => {
        touched.push('session');
        throw new Error('must not run');
      },
      resolveTarget: async () => (touched.push('target'), null),
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

test('evidence DELETE limits before rejecting an oversized declared body', async () => {
  const calls: string[] = [];
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
    resolveTarget: async () => (calls.push('target'), { proProfileId: A, credentialIds: [C] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    prepare: async () => (calls.push('mutation'), prepared()),
  });
  const oversized = removeRequest();
  oversized.headers.set('content-length', String(JSON_BODY_MAX_BYTES + 1));
  const response = await handler(oversized, { params: Promise.resolve({ evidenceId: E }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
  calls.length = 0;
  const chunkedResponse = await handler(chunkedRemoveRequest(JSON_BODY_MAX_BYTES + 1), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(chunkedResponse.status, 413);
  assert.equal((await chunkedResponse.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
});

test('evidence GET requires a live owner/operator with AAL2 and proxies the bounded file', async () => {
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
    download: async (path) => {
      assert.match(path, new RegExp(`${E}$`, 'u'));
      return new Blob(['%PDF-'], { type: 'application/pdf' });
    },
  });
  const response = await handler(new Request('http://localhost/evidence'), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('content-disposition'), 'attachment');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), '%PDF-');
  assert.doesNotMatch(response.url, /token|pro-credentials|10000000|20000000/iu);
});

test('evidence GET rejects oversized metadata and mismatched storage bodies', async () => {
  let downloads = 0;
  const session = async () => ({
    id: A,
    role: 'pro' as const,
    tenantId: A,
    aal: 'aal2' as const,
    mfaEnrolled: true,
    email: null,
  });
  const evidence = (sizeBytes: number) => async () => ({
    evidence_id: E,
    pro_profile_id: A,
    credential_id: C,
    storage_path: PATH,
    mime_type: 'application/pdf' as const,
    size_bytes: sizeBytes,
    original_name_safe: 'proof.pdf',
  });
  const oversized = createEvidenceGetHandler({
    requireViewer: session,
    open: evidence(PRO_CREDENTIAL_EVIDENCE_MAX_BYTES + 1),
    download: async () => {
      downloads += 1;
      return new Blob([]);
    },
  });
  assert.equal(
    (
      await oversized(new Request('http://localhost/evidence'), {
        params: Promise.resolve({ evidenceId: E }),
      })
    ).status,
    404,
  );
  assert.equal(downloads, 0);

  const mismatched = createEvidenceGetHandler({
    requireViewer: session,
    open: evidence(5),
    download: async () => new Blob(['sixsix']),
  });
  assert.equal(
    (
      await mismatched(new Request('http://localhost/evidence'), {
        params: Promise.resolve({ evidenceId: E }),
      })
    ).status,
    404,
  );
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
  const response = await handler(removeRequest(), { params: Promise.resolve({ evidenceId: E }) });
  assert.equal(response.status, 200);
  assert.equal(actor, A);
  assert.deepEqual(calls, [
    'csrf',
    'session',
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
  const makeRequest = () => removeRequest();
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
  const makeRequest = () => removeRequest();
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

test('evidence DELETE replays a committed finalize after metadata is gone without another storage delete', async () => {
  let prepares = 0;
  let erases = 0;
  let finalizes = 0;
  let committed = false;
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
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    prepare: async () => {
      prepares += 1;
      return committed ? { status: 'complete', credential } : prepared();
    },
    erase: async () => {
      erases += 1;
    },
    finalize: async () => {
      finalizes += 1;
      committed = true;
      throw new Error('response lost after commit');
    },
    revalidate: () => undefined,
  });

  const first = await handler(removeRequest(), { params: Promise.resolve({ evidenceId: E }) });
  assert.equal(first.status, 500);
  assert.doesNotMatch(JSON.stringify(await first.json()), /response lost|storage|path/iu);

  const replay = await handler(removeRequest(), { params: Promise.resolve({ evidenceId: E }) });
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).credential, credential);
  assert.equal(prepares, 2);
  assert.equal(erases, 1);
  assert.equal(finalizes, 1);
});

test('evidence DELETE rejects a completed receipt for a different credential', async () => {
  let revalidated = 0;
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
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed',
    prepare: async () => ({
      status: 'complete',
      credential: { ...credential, credentialId: '20000000-0000-4000-8000-000000000099' },
    }),
    erase: async () => {
      throw new Error('must not erase');
    },
    finalize: async () => {
      throw new Error('must not finalize');
    },
    revalidate: () => {
      revalidated += 1;
    },
  });
  assert.equal(
    (await handler(removeRequest(), { params: Promise.resolve({ evidenceId: E }) })).status,
    404,
  );
  assert.equal(revalidated, 0);
});

test('evidence DELETE hides wrong credential, cross-owner, and unknown evidence without mutation', async () => {
  const { ApiError } = await import('@/lib/errors');
  const otherCredential = '20000000-0000-4000-8000-000000000099';
  const otherPro = '10000000-0000-4000-8000-000000000099';
  let preparedCalls = 0;
  let erased = 0;
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
    limit: async () => 'allowed' as const,
    prepare: async () => {
      preparedCalls += 1;
      throw new ApiError('NOT_FOUND', 'private evidence state', 404);
    },
    erase: async () => {
      erased += 1;
    },
    finalize: async () => credential,
    revalidate: () => undefined,
  };
  const wrongCredential = createEvidenceDeleteHandler({
    ...base,
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
  });
  const wrong = await wrongCredential(removeRequest({ credentialId: otherCredential }), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(wrong.status, 404);

  const crossOwner = createEvidenceDeleteHandler({
    ...base,
    resolveTarget: async () => ({ proProfileId: otherPro, credentialIds: [C] }),
  });
  assert.equal(
    (await crossOwner(removeRequest(), { params: Promise.resolve({ evidenceId: E }) })).status,
    404,
  );
  assert.equal(preparedCalls, 0);

  const unknownEvidence = createEvidenceDeleteHandler({
    ...base,
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
  });
  const unknown = await unknownEvidence(removeRequest(), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(unknown.status, 404);
  assert.doesNotMatch(
    JSON.stringify(await unknown.json()),
    /private|evidence state|storage|path/iu,
  );
  assert.equal(preparedCalls, 1);
  assert.equal(erased, 0);
});

test('evidence DELETE makes a foreign existing reservation indistinguishable from unknown evidence', async () => {
  const { ApiError } = await import('@/lib/errors');
  let foreignPrepareCalls = 0;
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
    resolveTarget: async () => ({ proProfileId: A, credentialIds: [C] }),
    limit: async () => 'allowed' as const,
    erase: async () => {
      throw new Error('must not erase');
    },
    finalize: async () => {
      throw new Error('must not finalize');
    },
    revalidate: () => undefined,
  };
  const unknown = createEvidenceDeleteHandler({
    ...base,
    prepare: async () => {
      throw new ApiError('NOT_FOUND', 'unknown evidence detail', 404);
    },
  });
  const foreignReservation = createEvidenceDeleteHandler({
    ...base,
    prepare: async () => {
      foreignPrepareCalls += 1;
      throw new ApiError('NOT_FOUND', 'foreign reservation detail', 404);
    },
  });

  const unknownResponse = await unknown(removeRequest(), {
    params: Promise.resolve({ evidenceId: E }),
  });
  const foreignResponse = await foreignReservation(removeRequest(), {
    params: Promise.resolve({ evidenceId: E }),
  });
  assert.equal(foreignPrepareCalls, 1, 'cross-owner request must reach prepare');
  assert.equal(unknownResponse.status, 404);
  assert.equal(foreignResponse.status, unknownResponse.status);
  assert.deepEqual(await foreignResponse.json(), await unknownResponse.json());
});

test('evidence DELETE hides denied sessions and fails closed when authoritative scope cannot resolve', async () => {
  const request = removeRequest();
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
    download: async () => new Blob(['%PDF-']),
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
    const response = await handler(removeRequest(), { params: Promise.resolve({ evidenceId: E }) });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /private/iu);
  }
});
