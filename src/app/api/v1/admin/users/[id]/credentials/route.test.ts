import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminCredentialPostHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const P = '20000000-0000-4000-8000-000000000002';
const C = '30000000-0000-4000-8000-000000000003';
const O = '40000000-0000-4000-8000-000000000004';
const req = (body: unknown) =>
  new Request('http://localhost/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
      return { credentialId: C } as never;
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
