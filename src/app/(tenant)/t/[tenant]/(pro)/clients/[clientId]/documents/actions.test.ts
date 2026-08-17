import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runGetDocumentSignedUrlAction,
  runRequestDocumentAction,
  runReviewDocumentVersionAction,
  type LegacyDocumentActionDependencies,
} from './action-logic';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const AUTHORITATIVE_CLIENT_ID = '77777777-7777-4777-8777-777777777777';

const validRequest = {
  client_id: CLIENT_ID,
  doc_type: 'passport' as const,
  label: 'Passport copy',
};

function setup(overrides: Partial<LegacyDocumentActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: LegacyDocumentActionDependencies = {
    requirePro: async () => {
      calls.push('auth');
      return { id: ACTOR_ID, role: 'pro', tenantId: TENANT_ID };
    },
    resolveTenant: async (slug) => {
      calls.push(`tenant:${slug}`);
      return { id: TENANT_ID };
    },
    requireActive: async (tenantId) => {
      calls.push(`active:${tenantId}`);
    },
    callerMetadata: async () => {
      calls.push('headers');
      return { ip: '192.0.2.10', userAgent: 'test-agent' };
    },
    createRequest: async (ctx) => {
      calls.push(`request:${ctx.tenantId}:${ctx.actorId}:${ctx.role}`);
      return { id: REQUEST_ID, clientId: CLIENT_ID };
    },
    reviewVersion: async (versionId, ctx, review) => {
      calls.push(`review:${versionId}:${ctx.tenantId}:${review.status}`);
      return { clientId: CLIENT_ID };
    },
    openVersion: async (tenantId, versionId) => {
      calls.push(`open:${tenantId}:${versionId}`);
      return {
        url: 'https://storage.test/signed',
        expiresAt: '2026-08-14T12:05:00.000Z',
        storagePath: `${tenantId}/private.pdf`,
      };
    },
    revalidate: (path) => calls.push(`revalidate:${path}`),
    rethrowNavigation: () => undefined,
    logUnexpected: () => calls.push('logged'),
    ...overrides,
  };
  return { calls, dependencies };
}

test('each legacy document action freshly authorizes in order before DAL', async () => {
  const cases = [
    {
      operation: 'request:',
      invoke: (dependencies: LegacyDocumentActionDependencies) =>
        runRequestDocumentAction('acme', validRequest, dependencies),
    },
    {
      operation: 'review:',
      invoke: (dependencies: LegacyDocumentActionDependencies) =>
        runReviewDocumentVersionAction(
          'acme',
          CLIENT_ID,
          VERSION_ID,
          { status: 'approved' },
          dependencies,
        ),
    },
    {
      operation: 'open:',
      invoke: (dependencies: LegacyDocumentActionDependencies) =>
        runGetDocumentSignedUrlAction('acme', VERSION_ID, dependencies),
    },
  ];

  for (const action of cases) {
    const context = setup();
    await action.invoke(context.dependencies);
    const operation = context.calls.findIndex((call) => call.startsWith(action.operation));
    assert.ok(operation > -1);
    assert.deepEqual(context.calls.slice(0, operation), [
      'auth',
      'tenant:acme',
      `active:${TENANT_ID}`,
      'headers',
    ]);
  }
});

test('legacy document actions reject exact tenant mismatch before active or DAL', async () => {
  const context = setup({
    resolveTenant: async () => {
      context.calls.push('tenant:acme');
      return { id: OTHER_TENANT_ID };
    },
  });
  assert.deepEqual(await runGetDocumentSignedUrlAction('acme', VERSION_ID, context.dependencies), {
    ok: false,
    error: 'Action not allowed',
    code: 'FORBIDDEN',
    messageKey: 'documents.errors.forbidden',
  });
  assert.deepEqual(context.calls, ['auth', 'tenant:acme']);
});

test('legacy sanitizer rethrows Next navigation control flow', async () => {
  const navigationError = { digest: 'NEXT_REDIRECT;replace;/login;307;' };
  const context = setup({
    requirePro: async () => {
      context.calls.push('auth');
      throw navigationError;
    },
    rethrowNavigation: (error) => {
      context.calls.push('rethrow');
      if (error === navigationError) throw error;
    },
  });
  await assert.rejects(
    () => runGetDocumentSignedUrlAction('acme', VERSION_ID, context.dependencies),
    (error) => error === navigationError,
  );
  assert.deepEqual(context.calls, ['auth', 'rethrow']);
});

test('legacy production actions wire Next unstable_rethrow into the sanitizer seam', () => {
  const source = readFileSync(join(import.meta.dirname, 'actions.ts'), 'utf8');
  assert.match(source, /import \{ unstable_rethrow \} from 'next\/navigation'/u);
  assert.match(source, /unstable_rethrow\(error\)/u);
  assert.match(source, /normalizeActionRequestMetadata\(requestHeaders\)/u);
  assert.match(source, /logSafeActionError\(operation, error\)/u);
  assert.doesNotMatch(source, /console\.error/u);
});

test('ordinary auth, DAL, and unexpected errors are stable and never expose raw messages', async () => {
  const raw = 'relation private_documents leaked storage/tenant/private.pdf';
  const cases = [
    setup({
      requirePro: async () => {
        throw new ApiError('UNAUTHORIZED', raw, 401);
      },
    }),
    setup({
      createRequest: async () => {
        throw new ApiError('FORBIDDEN', raw, 403);
      },
    }),
    setup({
      openVersion: async () => {
        throw new Error(raw);
      },
    }),
  ];
  const results = [
    await runGetDocumentSignedUrlAction('acme', VERSION_ID, cases[0].dependencies),
    await runRequestDocumentAction('acme', validRequest, cases[1].dependencies),
    await runGetDocumentSignedUrlAction('acme', VERSION_ID, cases[2].dependencies),
  ];

  assert.equal(results[0].ok, false);
  if (!results[0].ok) assert.equal(results[0].code, 'UNAUTHORIZED');
  assert.equal(results[1].ok, false);
  if (!results[1].ok) assert.equal(results[1].code, 'FORBIDDEN');
  assert.equal(results[2].ok, false);
  if (!results[2].ok) assert.equal(results[2].code, 'INTERNAL');
  for (const result of results) {
    assert.doesNotMatch(JSON.stringify(result), /private_documents|storage\/tenant/u);
  }
});

test('legacy request and review successes revalidate firm and exact client routes', async () => {
  for (const invoke of [
    (dependencies: LegacyDocumentActionDependencies) =>
      runRequestDocumentAction('acme', validRequest, dependencies),
    (dependencies: LegacyDocumentActionDependencies) =>
      runReviewDocumentVersionAction(
        'acme',
        CLIENT_ID,
        VERSION_ID,
        { status: 'approved' },
        dependencies,
      ),
  ]) {
    const context = setup();
    assert.equal((await invoke(context.dependencies)).ok, true);
    assert.deepEqual(
      context.calls.filter((call) => call.startsWith('revalidate:')),
      ['revalidate:/t/acme/documents', `revalidate:/t/acme/clients/${CLIENT_ID}`],
    );
  }
});

test('legacy mutation failures never revalidate', async () => {
  const context = setup({
    reviewVersion: async () => {
      throw new ApiError('NOT_FOUND', 'raw database detail', 404);
    },
  });
  await runReviewDocumentVersionAction(
    'acme',
    CLIENT_ID,
    VERSION_ID,
    { status: 'approved' },
    context.dependencies,
  );
  assert.equal(
    context.calls.some((call) => call.startsWith('revalidate:')),
    false,
  );
});

test('legacy review revalidates the authoritative DAL client instead of the supplied client', async () => {
  const context = setup({
    reviewVersion: async () => ({ clientId: AUTHORITATIVE_CLIENT_ID }),
  });
  await runReviewDocumentVersionAction(
    'acme',
    CLIENT_ID,
    VERSION_ID,
    { status: 'approved' },
    context.dependencies,
  );
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('revalidate:')),
    ['revalidate:/t/acme/documents', `revalidate:/t/acme/clients/${AUTHORITATIVE_CLIENT_ID}`],
  );
});

test('legacy request canonicalizes an uppercase client UUID before DAL and cache invalidation', async () => {
  const canonicalClientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let receivedClientId: string | undefined;
  const context = setup({
    createRequest: async (_ctx, input) => {
      receivedClientId = input.client_id;
      return { id: REQUEST_ID, clientId: canonicalClientId };
    },
  });

  await runRequestDocumentAction(
    'acme',
    { ...validRequest, client_id: canonicalClientId.toUpperCase() },
    context.dependencies,
  );

  assert.equal(receivedClientId, canonicalClientId);
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('revalidate:')),
    ['revalidate:/t/acme/documents', `revalidate:/t/acme/clients/${canonicalClientId}`],
  );
});

test('legacy open returns only url and expiresAt', async () => {
  const context = setup();
  const result = await runGetDocumentSignedUrlAction('acme', VERSION_ID, context.dependencies);
  assert.deepEqual(result, {
    ok: true,
    data: {
      url: 'https://storage.test/signed',
      expiresAt: '2026-08-14T12:05:00.000Z',
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /storagePath|private\.pdf/u);
});
