import assert from 'node:assert/strict';
import test from 'node:test';
import { JSON_BODY_MAX_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { createAdminCredentialPostHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const P = '20000000-0000-4000-8000-000000000002';
const C = '30000000-0000-4000-8000-000000000003';
const O = '40000000-0000-4000-8000-000000000004';
const publicCredential = () => ({
  credentialId: C,
  type: 'pro_license' as const,
  maskedIdentifier: '•••• 9Z72',
  issuingAuthority: 'Synthetic Authority',
  issueDate: '2026-01-01',
  expiryDate: '2027-01-01',
  state: 'under_review' as const,
  version: 2,
  evidenceCount: 1,
  submittedAt: '2026-08-24T00:00:00.000Z',
  supersedesCredentialId: null,
});
const req = (body: unknown) =>
  new Request('http://localhost/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const chunkedReq = (bytes: number) =>
  new Request('http://localhost/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(bytes));
      },
    }),
    duplex: 'half',
  } as RequestInit);

test('admin review missing and mismatched CSRF touch no downstream stage', async () => {
  for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
    const touched: string[] = [];
    const handler = createAdminCredentialPostHandler({
      guardCsrf: async () => Response.json({ code }, { status: 403 }),
      requireOperator: async () => {
        touched.push('session');
        throw new Error('must not run');
      },
      resolveTarget: async () => (touched.push('target'), null),
      limit: async () => (touched.push('limit'), 'allowed'),
      review: async () => (touched.push('mutation'), null),
    });
    assert.equal((await handler(req({}), { params: Promise.resolve({ id: P }) })).status, 403);
    assert.deepEqual(touched, []);
  }
});

test('operator review limits before rejecting an oversized declared body', async () => {
  const calls: string[] = [];
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => (calls.push('target'), { proProfileId: P, credentialIds: [C] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    review: async () => (calls.push('mutation'), null),
    revalidate: () => undefined,
  });
  const oversized = req({
    command: 'begin_review',
    credentialId: C,
    expectedVersion: 1,
    operationId: O,
  });
  oversized.headers.set('content-length', String(JSON_BODY_MAX_BYTES + 1));
  const response = await handler(oversized, { params: Promise.resolve({ id: P }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
  calls.length = 0;
  const chunkedResponse = await handler(chunkedReq(JSON_BODY_MAX_BYTES + 1), {
    params: Promise.resolve({ id: P }),
  });
  assert.equal(chunkedResponse.status, 413);
  assert.equal((await chunkedResponse.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
});

test('operator review derives actor, resolves active PRO and credential before fail-closed limiting and mutation', async () => {
  const calls: string[] = [];
  let actor = '';
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => (calls.push('csrf'), null),
    requireOperator: async () => (
      calls.push('session'),
      { id: A, role: 'admin', tenantId: null, aal: 'aal2', mfaEnrolled: true, email: null }
    ),
    resolveTarget: async () => (
      calls.push('target'),
      { proProfileId: P, credentialIds: [C], companyId: null, tenantSlug: null }
    ),
    limit: async () => (calls.push('limit'), 'allowed'),
    review: async (id) => {
      actor = id;
      calls.push('mutation');
      return publicCredential();
    },
    revalidate: () => {
      calls.push('revalidate');
    },
  });
  const response = await handler(
    req({ command: 'begin_review', credentialId: C, expectedVersion: 1, operationId: O }),
    { params: Promise.resolve({ id: P }) },
  );
  assert.equal(response.status, 200);
  assert.equal(actor, A);
  assert.deepEqual(calls, ['csrf', 'session', 'target', 'limit', 'mutation', 'revalidate']);
});

test('operator creates the first credential draft for an active PRO without credentials', async () => {
  const calls: string[] = [];
  let createdFor = '';
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'super_admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    create: async (actorId, proProfileId, operationId) => {
      assert.deepEqual([actorId, operationId], [A, O]);
      createdFor = proProfileId;
      calls.push('create');
      return { ...publicCredential(), state: 'draft', version: 0, evidenceCount: 0 };
    },
    revalidate: () => {
      calls.push('revalidate');
    },
  });
  const response = await handler(req({ command: 'create', operationId: O }), {
    params: Promise.resolve({ id: P }),
  });
  assert.equal(response.status, 200);
  assert.equal(createdFor, P);
  assert.deepEqual(calls, ['limit', 'create', 'revalidate']);
});

test('operator cannot bypass replacement by creating over terminal credential history', async () => {
  let creates = 0;
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'super_admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
    limit: async () => 'allowed',
    create: async () => {
      creates += 1;
      return publicCredential();
    },
  });
  const response = await handler(req({ command: 'create', operationId: O }), {
    params: Promise.resolve({ id: P }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'Unable to complete lifecycle operation',
    code: 'CREDENTIAL_HISTORY_EXISTS',
  });
  assert.equal(creates, 0);
});

test('operator reject and revoke validate the transient identifier after schema and before mutation', async () => {
  for (const command of ['reject', 'revoke'] as const) {
    const calls: string[] = [];
    const handler = createAdminCredentialPostHandler({
      guardCsrf: async () => null,
      requireOperator: async () => ({
        id: A,
        role: 'admin',
        tenantId: null,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => (calls.push('target'), { proProfileId: P, credentialIds: [C] }),
      limit: async () => (calls.push('limit'), 'allowed'),
      validateReason: async (proProfileId, credentialId, reason) => {
        assert.deepEqual([proProfileId, credentialId, reason], [P, C, 'Unrelated review reason']);
        calls.push('reason');
      },
      review: async () => (calls.push('mutation'), publicCredential()),
      revalidate: () => {
        calls.push('revalidate');
      },
    });
    const response = await handler(
      req({
        command,
        credentialId: C,
        expectedVersion: 1,
        operationId: O,
        reasonCode: 'DOCUMENT_INVALID',
        reason: 'Unrelated review reason',
      }),
      { params: Promise.resolve({ id: P }) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['target', 'limit', 'reason', 'mutation', 'revalidate']);
  }

  for (const command of ['begin_review', 'verify'] as const) {
    let validations = 0;
    const handler = createAdminCredentialPostHandler({
      guardCsrf: async () => null,
      requireOperator: async () => ({
        id: A,
        role: 'admin',
        tenantId: null,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
      limit: async () => 'allowed',
      validateReason: async () => {
        validations += 1;
      },
      review: async () => publicCredential(),
      revalidate: () => undefined,
    });
    assert.equal(
      (
        await handler(req({ command, credentialId: C, expectedVersion: 1, operationId: O }), {
          params: Promise.resolve({ id: P }),
        })
      ).status,
      200,
    );
    assert.equal(validations, 0);
  }
});

test('unsafe identifier decision reason is sanitized and never reaches mutation', async () => {
  const { ApiError } = await import('@/lib/errors');
  let mutations = 0;
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
    limit: async () => 'allowed',
    validateReason: async () => {
      throw new ApiError('DECISION_REASON_INVALID', 'private LIC-9Z 72', 422);
    },
    review: async () => {
      mutations += 1;
      return null;
    },
    revalidate: () => undefined,
  });
  const response = await handler(
    req({
      command: 'reject',
      credentialId: C,
      expectedVersion: 1,
      operationId: O,
      reasonCode: 'DOCUMENT_INVALID',
      reason: 'Unrelated review reason',
    }),
    { params: Promise.resolve({ id: P }) },
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'DECISION_REASON_INVALID');
  assert.equal(mutations, 0);
});

test('structured secret reasons return a sanitized validation error before mutation', async () => {
  let mutations = 0;
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
    limit: async () => 'allowed',
    review: async () => {
      mutations += 1;
      return null;
    },
    revalidate: () => undefined,
  });
  for (const reason of [
    'Credential ciphertext: v1:QUFBQUFBQUFBQUFB:QkJCQkJCQkJCQkJCQkJCQg==:VEFTSzEzQ0FORElEQVRF',
    'Credential signed URL: https://storage.invalid/storage/v1/object/sign/pro-credentials/file.pdf?token=TASK13-CANARY',
    `Identifier hash: ${'0123456789abcdef'.repeat(4)}`,
    'Raw provider error: TASK13-CANARY-RAW-PROVIDER-ERROR',
  ]) {
    const response = await handler(
      req({
        command: 'reject',
        credentialId: C,
        expectedVersion: 1,
        operationId: O,
        reasonCode: 'DOCUMENT_INVALID',
        reason,
      }),
      { params: Promise.resolve({ id: P }) },
    );
    const payload = await response.json();
    const body = JSON.stringify(payload);
    assert.equal(response.status, 400);
    assert.deepEqual(payload, { error: 'Invalid request', code: 'VALIDATION_FAILED' });
    assert.doesNotMatch(body, /TASK13|QUFB|012345|storage\.invalid/iu);
  }
  assert.equal(mutations, 0);
});

test('operator review rejects protected mutation output at the route JSON boundary', async () => {
  const canaries = [
    'TASK13-CANARY-IDENTIFIER-9Z72',
    'v1:TASK13-CANARY-CIPHERTEXT',
    'TASK13-CANARY-HASH-0123456789',
    'pro-credentials/TASK13-CANARY-STORAGE-PATH',
    'https://storage.invalid/TASK13-CANARY-SIGNED-URL',
    'TASK13-CANARY-RAW-PROVIDER-ERROR',
  ];
  const handler = createAdminCredentialPostHandler({
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
    limit: async () => 'allowed',
    review: async () => ({
      credentialId: C,
      type: 'pro_license',
      maskedIdentifier: '•••• 9Z72',
      issuingAuthority: 'Synthetic Authority',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      state: 'verified',
      version: 2,
      evidenceCount: 1,
      submittedAt: '2026-08-24T00:00:00.000Z',
      supersedesCredentialId: null,
      identifier: canaries[0],
      identifierCiphertext: canaries[1],
      identifierHash: canaries[2],
      storagePath: canaries[3],
      signedUrl: canaries[4],
      rawError: canaries[5],
    }),
    revalidate: () => undefined,
  });
  const response = await handler(
    req({ command: 'verify', credentialId: C, expectedVersion: 1, operationId: O }),
    { params: Promise.resolve({ id: P }) },
  );
  const body = await response.text();
  assert.equal(response.status, 500);
  for (const canary of canaries) assert.doesNotMatch(body, new RegExp(canary, 'u'));
});

test('operator review rejects wrong role/AAL1, malformed or unknown targets, bad commands, stale/replay and limiter failure without leaks', async () => {
  const base = {
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin' as const,
      tenantId: null,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({
      proProfileId: P,
      credentialIds: [C],
      companyId: null,
      tenantSlug: null,
    }),
    limit: async () => 'allowed' as const,
    review: async () => ({ credentialId: C }) as never,
    revalidate: () => undefined,
  };
  const valid = { command: 'verify', credentialId: C, expectedVersion: 1, operationId: O };
  assert.equal(
    (
      await createAdminCredentialPostHandler({
        ...base,
        requireOperator: async () => {
          throw new Error('denied');
        },
      })(req(valid), { params: Promise.resolve({ id: P }) })
    ).status,
    404,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler({
        ...base,
        requireOperator: async () => ({ ...(await base.requireOperator()), aal: 'aal1' }),
      })(req(valid), { params: Promise.resolve({ id: P }) })
    ).status,
    403,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler(base)(req(valid), {
        params: Promise.resolve({ id: 'dirty' }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler({ ...base, resolveTarget: async () => null })(
        req(valid),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler({ ...base, limit: async () => 'unavailable' })(
        req(valid),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler(base)(req({ ...valid, command: 'approve' }), {
        params: Promise.resolve({ id: P }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await createAdminCredentialPostHandler(base)(
        req({
          ...valid,
          command: 'reject',
          reasonCode: 'manual_review',
          reason: 'Identifier could not be verified',
        }),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    400,
  );

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
    const response = await createAdminCredentialPostHandler({
      ...base,
      review: async () => {
        throw error;
      },
    })(req(valid), { params: Promise.resolve({ id: P }) });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /private/iu);
  }
});

test('operator reject/revoke reason matches the database safety boundary and maps its exact error', async () => {
  const base = {
    guardCsrf: async () => null,
    requireOperator: async () => ({
      id: A,
      role: 'admin' as const,
      tenantId: null,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: P, credentialIds: [C] }),
    limit: async () => 'allowed' as const,
    validateReason: async () => undefined,
    review: async () => ({ credentialId: C }),
    revalidate: () => undefined,
  };
  for (const invalid of [
    { reasonCode: `${'A'.repeat(65)}`, reason: 'Valid reason' },
    { reasonCode: 'VALID_CODE', reason: 'bad\u0000control' },
    { reasonCode: 'VALID_CODE', reason: 'contains pro-credentials/private' },
    { reasonCode: 'VALID_CODE', reason: 'leaks storage_path' },
    { reasonCode: 'VALID_CODE', reason: 'SQLSTATE P0001' },
    { reasonCode: 'VALID_CODE', reason: `identifier 10000000-0000-4000-8000-000000000001` },
  ]) {
    const response = await createAdminCredentialPostHandler(base)(
      req({ command: 'reject', credentialId: C, expectedVersion: 1, operationId: O, ...invalid }),
      { params: Promise.resolve({ id: P }) },
    );
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  const { ApiError } = await import('@/lib/errors');
  const mapped = await createAdminCredentialPostHandler({
    ...base,
    review: async () => {
      throw new ApiError('DECISION_REASON_INVALID', 'private', 422);
    },
  })(
    req({
      command: 'reject',
      credentialId: C,
      expectedVersion: 1,
      operationId: O,
      reasonCode: 'DOCUMENT_INVALID',
      reason: 'Could not verify document',
    }),
    { params: Promise.resolve({ id: P }) },
  );
  assert.equal(mapped.status, 422);
  assert.equal((await mapped.json()).code, 'DECISION_REASON_INVALID');
});
