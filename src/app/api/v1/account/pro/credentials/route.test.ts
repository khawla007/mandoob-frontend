import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildLifecycleRevalidationPaths,
  requireLiveLifecycleViewer,
  requireLiveProAccount,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';
import { JSON_BODY_MAX_BYTES } from '@/app/api/v1/_shared/bounded-body';
import { createCredentialPostHandler } from './route';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const CREDENTIAL = '20000000-0000-4000-8000-000000000002';
const OPERATION = '30000000-0000-4000-8000-000000000003';

function request(body: unknown) {
  return new Request('http://localhost/api/v1/account/pro/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chunkedJson(bytes: number) {
  return new Request('http://localhost/api/v1/account/pro/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(bytes));
      },
    }),
    duplex: 'half',
  } as RequestInit);
}

test('PRO credential mutation executes the security pipeline in order', async () => {
  const calls: string[] = [];
  const handler = createCredentialPostHandler({
    guardCsrf: async () => (calls.push('csrf'), null),
    requirePro: async () => {
      calls.push('session');
      return {
        id: ACTOR,
        role: 'pro',
        tenantId: ACTOR,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      };
    },
    resolveTarget: async () => (
      calls.push('target'),
      { proProfileId: ACTOR, credentialIds: [CREDENTIAL] }
    ),
    limit: async () => (calls.push('limit'), 'allowed'),
    mutate: async () => {
      calls.push('mutation');
      return { credentialId: CREDENTIAL, state: 'submitted', version: 2 } as never;
    },
    revalidate: () => {
      calls.push('revalidate');
    },
  });
  const response = await handler(
    request({
      command: 'submit',
      credentialId: CREDENTIAL,
      expectedVersion: 1,
      operationId: OPERATION,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['csrf', 'session', 'target', 'limit', 'mutation', 'revalidate']);
});

test('PRO credential mutation limits before rejecting an oversized declared body', async () => {
  const calls: string[] = [];
  const handler = createCredentialPostHandler({
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: ACTOR,
      role: 'pro',
      tenantId: ACTOR,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => (calls.push('target'), { proProfileId: ACTOR, credentialIds: [] }),
    limit: async () => (calls.push('limit'), 'allowed'),
    mutate: async () => (calls.push('mutation'), null),
    revalidate: () => undefined,
  });
  const oversized = request({ command: 'create', operationId: OPERATION });
  oversized.headers.set('content-length', String(JSON_BODY_MAX_BYTES + 1));
  const response = await handler(oversized);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
  calls.length = 0;
  const chunkedResponse = await handler(chunkedJson(JSON_BODY_MAX_BYTES + 1));
  assert.equal(chunkedResponse.status, 413);
  assert.equal((await chunkedResponse.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(calls, ['target', 'limit']);
});

test('PRO credential mutation blocks CSRF, AAL1, unknown credentials, limiter uncertainty and malformed commands', async (t) => {
  const base = {
    guardCsrf: async () => null,
    requirePro: async () => ({
      id: ACTOR,
      role: 'pro' as const,
      tenantId: ACTOR,
      aal: 'aal2' as const,
      mfaEnrolled: true,
      email: null,
    }),
    resolveTarget: async () => ({ proProfileId: ACTOR, credentialIds: [CREDENTIAL] }),
    limit: async () => 'allowed' as const,
    mutate: async () => ({ credentialId: CREDENTIAL }) as never,
    revalidate: () => undefined,
  };
  await t.test('missing and mismatched CSRF short-circuit every downstream stage', async () => {
    for (const code of ['CSRF_REQUIRED', 'CSRF_MISMATCH']) {
      const touched: string[] = [];
      const handler = createCredentialPostHandler({
        guardCsrf: async () => Response.json({ code }, { status: 403 }),
        requirePro: async () => (touched.push('session'), base.requirePro()),
        resolveTarget: async () => (touched.push('target'), base.resolveTarget()),
        limit: async () => (touched.push('limit'), 'allowed'),
        mutate: async () => (touched.push('mutation'), { credentialId: CREDENTIAL }) as never,
      });
      assert.equal((await handler(request({}))).status, 403);
      assert.deepEqual(touched, []);
    }
  });
  await t.test('AAL2 required', async () => {
    const handler = createCredentialPostHandler({
      ...base,
      requirePro: async () => ({ ...(await base.requirePro()), aal: 'aal1' }),
    });
    assert.equal(
      (await handler(request({ command: 'create', operationId: OPERATION }))).status,
      403,
    );
  });
  await t.test('unknown and cross-PRO do not leak', async () => {
    const handler = createCredentialPostHandler({ ...base, resolveTarget: async () => null });
    const response = await handler(
      request({
        command: 'submit',
        credentialId: CREDENTIAL,
        expectedVersion: 1,
        operationId: OPERATION,
      }),
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'Resource not found');
  });
  await t.test('limiter uncertainty fails closed', async () => {
    const handler = createCredentialPostHandler({ ...base, limit: async () => 'unavailable' });
    assert.equal(
      (await handler(request({ command: 'create', operationId: OPERATION }))).status,
      503,
    );
  });
  await t.test('unknown and malformed commands are rejected without mutation', async () => {
    let mutations = 0;
    const handler = createCredentialPostHandler({
      ...base,
      mutate: async () => {
        mutations += 1;
        return {} as never;
      },
    });
    assert.equal(
      (await handler(request({ command: 'delete', operationId: OPERATION }))).status,
      400,
    );
    assert.equal(
      (
        await handler(
          request({
            command: 'submit',
            credentialId: 'dirty',
            expectedVersion: -1,
            operationId: OPERATION,
          }),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await handler(
          request({
            command: 'submit',
            credentialId: CREDENTIAL,
            expectedVersion: Number.MAX_SAFE_INTEGER + 1,
            operationId: OPERATION,
          }),
        )
      ).status,
      400,
    );
    assert.equal(mutations, 0);
  });
});

test('PRO route sanitizes stale, replay, and unknown mutation errors', async () => {
  const { ApiError } = await import('@/lib/errors');
  for (const [error, status, code] of [
    [new ApiError('NOT_FOUND', 'secret', 404), 404, 'NOT_FOUND'],
    [new ApiError('STALE_CREDENTIAL_VERSION', 'secret', 409), 409, 'STALE_CREDENTIAL_VERSION'],
    [new ApiError('OPERATION_REUSED', 'secret', 409), 409, 'OPERATION_REUSED'],
    [new Error('database secret'), 500, 'INTERNAL'],
  ] as const) {
    const handler = createCredentialPostHandler({
      guardCsrf: async () => null,
      requirePro: async () => ({
        id: ACTOR,
        role: 'pro',
        tenantId: ACTOR,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => ({ proProfileId: ACTOR, credentialIds: [] }),
      limit: async () => 'allowed',
      mutate: async () => {
        throw error;
      },
      revalidate: () => undefined,
    });
    const response = await handler(request({ command: 'create', operationId: OPERATION }));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal(JSON.stringify(body).includes('secret'), false);
  }
});

test('PRO credential mutation hides denied live sessions and revalidates every affected surface', async () => {
  const denied = createCredentialPostHandler({
    guardCsrf: async () => null,
    requirePro: async () => {
      throw new Error('inactive account');
    },
  });
  const response = await denied(request({ command: 'create', operationId: OPERATION }));
  assert.equal(response.status, 404);
  assert.doesNotMatch(JSON.stringify(await response.json()), /inactive account/iu);

  assert.deepEqual(
    buildLifecycleRevalidationPaths(
      {
        proProfileId: ACTOR,
        credentialIds: [],
        companyId: '40000000-0000-4000-8000-000000000004',
        tenantSlug: 'assigned-firm',
      },
      ACTOR,
    ),
    [
      '/admin/users',
      `/admin/users/${ACTOR}`,
      `/admin/users/${ACTOR}/edit`,
      '/admin/companies',
      '/admin/companies/40000000-0000-4000-8000-000000000004',
      '/account/role',
      '/t/assigned-firm',
    ],
  );

  const shared = readFileSync('src/app/api/v1/_shared/pro-lifecycle-routes.ts', 'utf8');
  assert.match(shared, /assignmentError[\s\S]*if \(assignmentError\) return null/u);
  assert.match(shared, /tenantError[\s\S]*if \(tenantError\) return null/u);
});

test('lifecycle account guard permits an active unassigned PRO but denies stale/inactive roles', async () => {
  const session = {
    id: ACTOR,
    role: 'customer' as const,
    tenantId: null,
    aal: 'aal2' as const,
    mfaEnrolled: true,
    email: null,
  };
  const activePro = {
    role: 'pro',
    status: 'active',
    tenant_id: null,
  };
  const pro = await requireLiveProAccount({
    requireSession: async () => session,
    lookupProfile: async () => activePro,
  });
  assert.equal(pro.role, 'pro');
  assert.equal(pro.tenantId, null);

  const operator = await requireLiveLifecycleViewer({
    requireSession: async () => session,
    lookupProfile: async () => ({ role: 'admin', status: 'active', tenant_id: null }),
  });
  assert.equal(operator.role, 'admin');

  for (const profile of [
    { role: 'pro', status: 'inactive', tenant_id: null },
    { role: 'customer', status: 'active', tenant_id: null },
  ]) {
    await assert.rejects(
      requireLiveProAccount({
        requireSession: async () => session,
        lookupProfile: async () => profile,
      }),
    );
  }
});
