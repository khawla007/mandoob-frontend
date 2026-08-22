import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommercialTermPostHandler } from './route';

const A = '10000000-0000-4000-8000-000000000001';
const P = '20000000-0000-4000-8000-000000000002';
const T = '30000000-0000-4000-8000-000000000003';
const O = '40000000-0000-4000-8000-000000000004';
const request = (body: unknown) =>
  new Request('http://localhost/terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('commercial terms missing and mismatched CSRF touch no downstream stage', async () => {
  for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
    const touched: string[] = [];
    const handler = createCommercialTermPostHandler({
      guardCsrf: async () => Response.json({ code }, { status: 403 }),
      requireOperator: async () => {
        touched.push('session');
        throw new Error('must not run');
      },
      resolveTarget: async () => (touched.push('target'), null),
      limit: async () => (touched.push('limit'), 'allowed'),
      mutate: async () => (touched.push('mutation'), null),
    });
    assert.equal((await handler(request({}), { params: Promise.resolve({ id: P }) })).status, 403);
    assert.deepEqual(touched, []);
  }
});

test('commercial term commands use ordered guards, session actor and revalidation', async () => {
  const calls: string[] = [];
  let actor = '';
  const handler = createCommercialTermPostHandler({
    guardCsrf: async () => (calls.push('csrf'), null),
    requireOperator: async () => (
      calls.push('session'),
      { id: A, role: 'super_admin', tenantId: null, aal: 'aal2', mfaEnrolled: true, email: null }
    ),
    resolveTarget: async () => (
      calls.push('target'),
      {
        proProfileId: P,
        credentialIds: [],
        termIds: [T],
        companyId: '50000000-0000-4000-8000-000000000005',
        tenantSlug: 'firm',
      }
    ),
    limit: async () => (calls.push('limit'), 'allowed'),
    mutate: async (id) => {
      actor = id;
      calls.push('mutation');
      return { termId: T } as never;
    },
    revalidate: () => {
      calls.push('revalidate');
    },
  });
  const response = await handler(
    request({ command: 'activate', termId: T, expectedVersion: 0, operationId: O }),
    { params: Promise.resolve({ id: P }) },
  );
  assert.equal(response.status, 200);
  assert.equal(actor, A);
  assert.deepEqual(calls, ['csrf', 'session', 'target', 'limit', 'mutation', 'revalidate']);
});

test('commercial terms allowlist create_draft|activate|end and fail closed/non-leaking', async () => {
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
      credentialIds: [],
      termIds: [T],
      companyId: null,
      tenantSlug: null,
    }),
    limit: async () => 'allowed' as const,
    mutate: async () => ({ termId: T }) as never,
    revalidate: () => undefined,
  };
  const valid = { command: 'activate', termId: T, expectedVersion: 0, operationId: O };
  assert.equal(
    (
      await createCommercialTermPostHandler(base)(request({ ...valid, command: 'delete' }), {
        params: Promise.resolve({ id: P }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await createCommercialTermPostHandler(base)(request({ ...valid, termId: 'dirty' }), {
        params: Promise.resolve({ id: P }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await createCommercialTermPostHandler(base)(
        request({
          command: 'create_draft',
          termKind: 'pricing',
          model: 'retainer',
          currency: 'USD',
          amountMinor: -1,
          retainerInterval: null,
          effectiveFrom: 'bad',
          effectiveTo: null,
          operationId: O,
        }),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await createCommercialTermPostHandler({ ...base, resolveTarget: async () => null })(
        request(valid),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await createCommercialTermPostHandler({ ...base, limit: async () => 'unavailable' })(
        request(valid),
        { params: Promise.resolve({ id: P }) },
      )
    ).status,
    503,
  );
  const unknown = createCommercialTermPostHandler({
    ...base,
    mutate: async () => {
      throw new Error('database secret');
    },
  });
  const response = await unknown(request(valid), { params: Promise.resolve({ id: P }) });
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /database secret/iu);

  const { ApiError } = await import('@/lib/errors');
  for (const [error, code] of [
    [new ApiError('STALE_TERM_VERSION', 'private stale detail', 409), 'STALE_TERM_VERSION'],
    [new ApiError('OPERATION_REUSED', 'private replay detail', 409), 'OPERATION_REUSED'],
  ] as const) {
    const staleOrReplay = createCommercialTermPostHandler({
      ...base,
      mutate: async () => {
        throw error;
      },
    });
    const failed = await staleOrReplay(request(valid), { params: Promise.resolve({ id: P }) });
    assert.equal(failed.status, 409);
    const body = await failed.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /private/iu);
  }
});
