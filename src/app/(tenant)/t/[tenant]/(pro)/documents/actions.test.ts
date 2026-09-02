import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runLoadVersionHistoryAction,
  runOpenDocumentVersionAction,
  runRequestDocumentCenterAction,
  runReviewDocumentCenterAction,
  runSetDocumentExpiryAction,
  type DocumentCenterActionDependencies,
} from './action-logic';
import { authorizeDocumentCenterRead } from './page-authorization';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';
const VERSION_ID = '66666666-6666-4666-8666-666666666666';
const REQUEST_ID = '77777777-7777-4777-8777-777777777777';

function setup(overrides: Partial<DocumentCenterActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: DocumentCenterActionDependencies = {
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
    resolveAssignedCompany: async (profileId, slug) => {
      calls.push(`company:${profileId}:${slug}`);
      return { id: COMPANY_ID, tenantId: TENANT_ID };
    },
    callerMetadata: async () => {
      calls.push('headers');
      return { ip: '192.0.2.1', userAgent: 'test-agent' };
    },
    createRequest: async (ctx) => {
      calls.push(`request:${ctx.tenantId}:${ctx.actorId}:${ctx.role}`);
      return { id: REQUEST_ID, companyId: COMPANY_ID };
    },
    openVersion: async (tenantId, companyId, versionId) => {
      calls.push(`open:${tenantId}:${companyId}:${versionId}`);
      return {
        url: 'https://storage.test/signed',
        expiresAt: '2026-08-14T12:05:00.000Z',
        storagePath: `${tenantId}/private.pdf`,
      };
    },
    loadHistory: async (tenantId, companyId, documentId) => {
      calls.push(`history:${tenantId}:${companyId}:${documentId}`);
      return [
        {
          versionId: VERSION_ID,
          versionNumber: 1,
          current: true,
          uploadedAt: '2026-08-14T12:00:00.000Z',
          uploadedBy: ACTOR_ID,
          uploaderName: 'Operator',
          reviewStatus: 'pending' as const,
          reviewedBy: null,
          reviewerName: null,
          reviewedAt: null,
          reviewNote: null,
          sizeBytes: 123,
          mimeType: 'application/pdf',
          storagePath: `${tenantId}/private.pdf`,
        },
      ];
    },
    revalidate: (path) => calls.push(`revalidate:${path}`),
    rethrowNavigation: () => undefined,
    logUnexpected: () => calls.push('logged'),
    ...overrides,
  };
  return { calls, dependencies };
}

function requestForm() {
  const form = new FormData();
  form.append('doc_type', 'passport');
  form.append('label', 'Passport copy');
  form.append('due_at', '2026-08-31');
  form.append('notes', 'Clear colour scan');
  return form;
}

function reviewForm() {
  const form = new FormData();
  form.append('version_id', VERSION_ID);
  form.append('company_id', COMPANY_ID);
  form.append('status', 'approved');
  form.append('note', 'Readable');
  return form;
}

function expiryForm() {
  const form = new FormData();
  form.append('document_id', DOCUMENT_ID);
  form.append('company_id', COMPANY_ID);
  form.append('expires_on', '2027-08-31');
  return form;
}

test('document center page authorizes auth, exact tenant, active status, then read', async () => {
  const calls: string[] = [];
  const tenant = await authorizeDocumentCenterRead('acme', {
    requirePro: async () => {
      calls.push('auth');
      return { tenantId: TENANT_ID };
    },
    resolveTenant: async () => {
      calls.push('tenant');
      return { id: TENANT_ID, name: 'Acme' };
    },
    requireActive: async () => {
      calls.push('active');
    },
  });
  calls.push('read');
  assert.equal(tenant?.id, TENANT_ID);
  assert.deepEqual(calls, ['auth', 'tenant', 'active', 'read']);
});

test('document center page propagates role failures and returns null for a missing slug', async () => {
  const roleError = new ApiError('UNAUTHORIZED', 'role rejected', 401);
  await assert.rejects(
    () =>
      authorizeDocumentCenterRead('acme', {
        requirePro: async () => {
          throw roleError;
        },
        resolveTenant: async () => {
          assert.fail('tenant lookup after failed role authorization');
        },
        requireActive: async () => assert.fail('active check after failed role authorization'),
      }),
    (error) => error === roleError,
  );

  assert.equal(
    await authorizeDocumentCenterRead('missing', {
      requirePro: async () => ({ tenantId: TENANT_ID }),
      resolveTenant: async () => null,
      requireActive: async () => assert.fail('active check for missing tenant'),
    }),
    null,
  );
});

test('document center page rejects cross-firm access before active/read with sanitized error', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () =>
      authorizeDocumentCenterRead('acme', {
        requirePro: async () => {
          calls.push('auth');
          return { tenantId: OTHER_TENANT_ID };
        },
        resolveTenant: async () => {
          calls.push('tenant');
          return { id: TENANT_ID, name: 'Acme' };
        },
        requireActive: async () => calls.push('active'),
      }),
    (error) =>
      error instanceof ApiError && error.code === 'FORBIDDEN' && error.message === 'Access denied',
  );
  assert.deepEqual(calls, ['auth', 'tenant']);
});

test('document center page propagates inactive state after exact firm match', async () => {
  const calls: string[] = [];
  const inactive = new ApiError('TENANT_INACTIVE', 'raw inactive detail', 403);
  await assert.rejects(
    () =>
      authorizeDocumentCenterRead('acme', {
        requirePro: async () => {
          calls.push('auth');
          return { tenantId: TENANT_ID };
        },
        resolveTenant: async () => {
          calls.push('tenant');
          return { id: TENANT_ID, name: 'Acme' };
        },
        requireActive: async () => {
          calls.push('active');
          throw inactive;
        },
      }),
    (error) => error === inactive,
  );
  assert.deepEqual(calls, ['auth', 'tenant', 'active']);
});

const actionOrderCases = [
  {
    name: 'request',
    operation: 'request:',
    invoke: (deps: DocumentCenterActionDependencies) =>
      runRequestDocumentCenterAction('acme', null, requestForm(), deps),
  },
  {
    name: 'open',
    operation: 'open:',
    invoke: (deps: DocumentCenterActionDependencies) =>
      runOpenDocumentVersionAction('acme', VERSION_ID, deps),
  },
  {
    name: 'history',
    operation: 'history:',
    invoke: (deps: DocumentCenterActionDependencies) =>
      runLoadVersionHistoryAction('acme', DOCUMENT_ID, deps),
  },
] as const;

for (const action of actionOrderCases) {
  test(`${action.name} action independently runs auth, tenant, active, headers, then DAL`, async () => {
    const context = setup();
    await action.invoke(context.dependencies);
    const dalIndex = context.calls.findIndex((call) => call.startsWith(action.operation));
    assert.ok(dalIndex > -1);
    assert.deepEqual(context.calls.slice(0, dalIndex), [
      'auth',
      'tenant:acme',
      `active:${TENANT_ID}`,
      'headers',
      `company:${ACTOR_ID}:acme`,
    ]);
  });
}

test('firm actions module exports only the five public Server Actions', () => {
  const source = readFileSync(join(import.meta.dirname, 'actions.ts'), 'utf8');
  const exportedFunctions = [...source.matchAll(/export async function (\w+)/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(exportedFunctions, [
    'requestDocumentCenterAction',
    'reviewDocumentCenterAction',
    'openDocumentVersionAction',
    'loadVersionHistoryAction',
    'setDocumentExpiryAction',
  ]);
  assert.doesNotMatch(source, /export (?:type )?\{?[^\n]*(?:Dependencies|run[A-Z])/u);
});

test('review and expiry actions stop at the live company boundary until their RPCs accept it', async () => {
  for (const [invoke, mutation] of [
    [
      (deps: DocumentCenterActionDependencies) =>
        runReviewDocumentCenterAction('acme', null, reviewForm(), deps),
      'review:',
    ],
    [
      (deps: DocumentCenterActionDependencies) =>
        runSetDocumentExpiryAction('acme', null, expiryForm(), deps),
      'expiry:',
    ],
  ] as const) {
    const context = setup();
    const result = await invoke(context.dependencies);
    assert.deepEqual(result, {
      ok: false,
      code: 'PHASE_3_UNAVAILABLE',
      messageKey: 'documents.errors.phase3Unavailable',
    });
    assert.equal(
      context.calls.some((call) => call.startsWith(mutation)),
      false,
    );
    assert.deepEqual(context.calls, [
      'auth',
      'tenant:acme',
      `active:${TENANT_ID}`,
      'headers',
      `company:${ACTOR_ID}:acme`,
    ]);
  }
});

test('open and history pass the live assigned company into their DAL ownership boundary', async () => {
  const opened: string[][] = [];
  const histories: string[][] = [];
  const context = setup({
    openVersion: async (...args) => {
      opened.push(args);
      return { url: 'https://storage.test/signed', expiresAt: '2026-08-14T12:05:00.000Z' };
    },
    loadHistory: async (...args) => {
      histories.push(args);
      return [];
    },
  });

  await runOpenDocumentVersionAction('acme', VERSION_ID, context.dependencies);
  await runLoadVersionHistoryAction('acme', DOCUMENT_ID, context.dependencies);

  assert.deepEqual(opened, [[TENANT_ID, COMPANY_ID, VERSION_ID]]);
  assert.deepEqual(histories, [[TENANT_ID, COMPANY_ID, DOCUMENT_ID]]);
});

test('firm action logic module is server-only without becoming a Server Function', () => {
  const source = readFileSync(join(import.meta.dirname, 'action-logic.ts'), 'utf8');
  assert.match(source, /^import 'server-only';/u);
  assert.doesNotMatch(source, /^['"]use server['"];/mu);
});

test('firm production actions wire navigation rethrow, trusted metadata, and safe logging', () => {
  const source = readFileSync(join(import.meta.dirname, 'actions.ts'), 'utf8');
  assert.match(source, /import \{ unstable_rethrow \} from 'next\/navigation'/u);
  assert.match(source, /unstable_rethrow\(error\)/u);
  assert.match(source, /normalizeActionRequestMetadata\(requestHeaders\)/u);
  assert.match(source, /logSafeActionError\(operation, error\)/u);
  assert.doesNotMatch(source, /console\.error/u);
});

test('document actions serialize role failures and stop before tenant resolution or DAL', async () => {
  const context = setup({
    requirePro: async () => {
      context.calls.push('auth');
      throw new ApiError('UNAUTHORIZED', 'raw authentication detail', 401);
    },
  });
  const result = await runOpenDocumentVersionAction('acme', VERSION_ID, context.dependencies);
  assert.deepEqual(result, {
    ok: false,
    code: 'UNAUTHORIZED',
    messageKey: 'documents.errors.unauthorized',
  });
  assert.deepEqual(context.calls, ['auth']);
});

test('document center actions rethrow Next navigation control flow', async () => {
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
    () => runOpenDocumentVersionAction('acme', VERSION_ID, context.dependencies),
    (error) => error === navigationError,
  );
  assert.deepEqual(context.calls, ['auth', 'rethrow']);
});

test('cross-firm action authorization stops before active, headers, DAL, and revalidation', async () => {
  const context = setup({
    resolveTenant: async () => {
      context.calls.push('tenant:acme');
      return { id: OTHER_TENANT_ID };
    },
  });
  const result = await runRequestDocumentCenterAction(
    'acme',
    null,
    requestForm(),
    context.dependencies,
  );
  assert.deepEqual(result, {
    ok: false,
    code: 'FORBIDDEN',
    messageKey: 'documents.errors.forbidden',
  });
  assert.deepEqual(context.calls, ['auth', 'tenant:acme']);
});

test('request action uses first string values and rejects Blob values before DAL', async () => {
  let received: Record<string, unknown> | undefined;
  let createCalls = 0;
  const context = setup({
    createRequest: async (_ctx, input) => {
      createCalls += 1;
      received = input as Record<string, unknown>;
      return { id: REQUEST_ID, companyId: COMPANY_ID };
    },
  });
  const repeated = requestForm();
  repeated.append('label', 'malicious second value');
  const success = await runRequestDocumentCenterAction(
    'acme',
    null,
    repeated,
    context.dependencies,
  );
  assert.equal(success.ok, true);
  assert.equal(received?.label, 'Passport copy');

  const blob = requestForm();
  blob.set('label', new Blob(['secret']), 'secret.txt');
  const rejected = await runRequestDocumentCenterAction('acme', null, blob, context.dependencies);
  assert.deepEqual(rejected, {
    ok: false,
    code: 'VALIDATION_FAILED',
    messageKey: 'documents.errors.validation',
  });
  assert.equal(createCalls, 1);
});

test('unavailable review accepts no crafted form path to the mutation DAL', async () => {
  const context = setup();
  const rejected = reviewForm();
  rejected.set('status', 'rejected');
  rejected.set('note', '\u2003');
  assert.equal(
    (await runReviewDocumentCenterAction('acme', null, rejected, context.dependencies)).ok,
    false,
  );
  rejected.set('note', 'Unreadable');
  rejected.set('version_id', 'not-a-uuid');
  assert.equal(
    (await runReviewDocumentCenterAction('acme', null, rejected, context.dependencies)).ok,
    false,
  );
  assert.equal(
    context.calls.some((call) => call.startsWith('review:')),
    false,
  );
});

test('request, open, and history errors are stable and sanitized while unavailable mutations expose no internals', async () => {
  const raw = 'relation private_documents leaked storage/tenant/private.pdf';
  const operations = [
    () => {
      const context = setup({
        createRequest: async () => {
          throw new ApiError('FORBIDDEN', raw, 403);
        },
      });
      return runRequestDocumentCenterAction('acme', null, requestForm(), context.dependencies);
    },
    () => {
      const context = setup({
        openVersion: async () => {
          throw new ApiError('NOT_FOUND', raw, 404);
        },
      });
      return runOpenDocumentVersionAction('acme', VERSION_ID, context.dependencies);
    },
    () => {
      const context = setup({
        loadHistory: async () => {
          throw new ApiError('INTERNAL', raw, 500);
        },
      });
      return runLoadVersionHistoryAction('acme', DOCUMENT_ID, context.dependencies);
    },
    () => runReviewDocumentCenterAction('acme', null, reviewForm(), setup().dependencies),
    () => runSetDocumentExpiryAction('acme', null, expiryForm(), setup().dependencies),
  ];

  for (const operation of operations) {
    const result = await operation();
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /private_documents|storage\/tenant/u);
  }
});

test('successful requests revalidate only the firm workspace routes', async () => {
  const context = setup();
  const result = await runRequestDocumentCenterAction(
    'acme',
    null,
    requestForm(),
    context.dependencies,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('revalidate:')),
    ['revalidate:/t/acme/documents', 'revalidate:/t/acme/company'],
  );
});

test('request ignores a spoofed company UUID and uses the server assignment', async () => {
  const spoofedCompanyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let receivedCompanyId: string | undefined;
  const context = setup({
    createRequest: async (_ctx, input) => {
      receivedCompanyId = input.company_id;
      return { id: REQUEST_ID, companyId: COMPANY_ID };
    },
  });
  const form = requestForm();
  form.set('company_id', spoofedCompanyId.toUpperCase());
  await runRequestDocumentCenterAction('acme', null, form, context.dependencies);
  assert.equal(receivedCompanyId, COMPANY_ID);
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('revalidate:')),
    ['revalidate:/t/acme/documents', 'revalidate:/t/acme/company'],
  );
});

test('unavailable mutations never revalidate', async () => {
  for (const invoke of [
    (deps: DocumentCenterActionDependencies) =>
      runReviewDocumentCenterAction('acme', null, reviewForm(), deps),
    (deps: DocumentCenterActionDependencies) =>
      runSetDocumentExpiryAction('acme', null, expiryForm(), deps),
  ]) {
    const context = setup();
    await invoke(context.dependencies);
    assert.equal(
      context.calls.some((call) => call.startsWith('revalidate:')),
      false,
    );
  }
});

test('open and history success results expose no storage path', async () => {
  const context = setup();
  const opened = await runOpenDocumentVersionAction('acme', VERSION_ID, context.dependencies);
  const history = await runLoadVersionHistoryAction('acme', DOCUMENT_ID, context.dependencies);
  assert.equal(opened.ok, true);
  assert.equal(history.ok, true);
  assert.doesNotMatch(JSON.stringify(opened), /storagePath|private\.pdf/u);
  assert.doesNotMatch(JSON.stringify(history), /storagePath|private\.pdf/u);
});
