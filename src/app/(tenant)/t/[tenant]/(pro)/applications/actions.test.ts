import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runCreateApplicationAction,
  runUpdateApplicationAction,
  type ApplicationActionDependencies,
} from './action-logic';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const CASE_ID = '55555555-5555-4555-8555-555555555555';

function setup(overrides: Partial<ApplicationActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: ApplicationActionDependencies = {
    requirePro: async () => {
      calls.push('auth');
      return { id: ACTOR_ID, tenantId: TENANT_ID };
    },
    resolveTenant: async (slug) => {
      calls.push(`tenant:${slug}`);
      return { id: TENANT_ID };
    },
    requireActive: async (tenantId) => {
      calls.push(`active:${tenantId}`);
    },
    createCase: async (ctx) => {
      calls.push(`create:${ctx.tenantId}:${ctx.actorId}:${ctx.role}`);
      return { id: CASE_ID };
    },
    updateCase: async (ctx, id) => {
      calls.push(`update:${ctx.tenantId}:${ctx.actorId}:${ctx.role}:${id}`);
    },
    revalidate: (path) => {
      calls.push(`revalidate:${path}`);
    },
    ...overrides,
  };
  return { calls, dependencies };
}

const validCreate = {
  client_id: CLIENT_ID,
  title: 'Investor visa application',
  service_type: 'Investor visa',
};

test('application actions authenticate before resolving tenant or mutating', async () => {
  const context = setup({
    requirePro: async () => {
      context.calls.push('auth');
      throw new ApiError('UNAUTHORIZED', 'Sign in required', 401);
    },
  });

  await assert.rejects(
    () => runCreateApplicationAction('acme', validCreate, context.dependencies),
    (error) => error instanceof ApiError && error.code === 'UNAUTHORIZED',
  );
  assert.deepEqual(context.calls, ['auth']);
});

test('application actions reject a slug/session tenant mismatch before active check or mutation', async () => {
  const context = setup({
    resolveTenant: async () => {
      context.calls.push('tenant:acme');
      return { id: OTHER_TENANT_ID };
    },
  });

  assert.deepEqual(await runCreateApplicationAction('acme', validCreate, context.dependencies), {
    ok: false,
    error: 'Cross-tenant access denied',
    code: 'FORBIDDEN',
  });
  assert.deepEqual(context.calls, ['auth', 'tenant:acme']);
});

test('create action returns validation errors without calling the data mutation', async () => {
  const context = setup();
  const result = await runCreateApplicationAction(
    'acme',
    { client_id: 'not-a-uuid', title: '', service_type: '' },
    context.dependencies,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'VALIDATION_FAILED');
  assert.deepEqual(context.calls, ['auth', 'tenant:acme', `active:${TENANT_ID}`]);
});

test('update action returns validation errors without calling the data mutation', async () => {
  const context = setup();
  const result = await runUpdateApplicationAction(
    'acme',
    CASE_ID,
    { status: 'completed', completed_at: null },
    context.dependencies,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'VALIDATION_FAILED');
  assert.equal(
    context.calls.some((call) => call.startsWith('update:')),
    false,
  );
});

test('create action authorizes, mutates, and revalidates applications plus dashboard', async () => {
  const context = setup();
  assert.deepEqual(await runCreateApplicationAction('acme', validCreate, context.dependencies), {
    ok: true,
    data: { id: CASE_ID },
  });
  assert.deepEqual(context.calls, [
    'auth',
    'tenant:acme',
    `active:${TENANT_ID}`,
    `create:${TENANT_ID}:${ACTOR_ID}:pro`,
    'revalidate:/t/acme/applications',
    'revalidate:/t/acme/dashboard',
  ]);
});

test('update action authorizes, mutates, and revalidates applications plus dashboard', async () => {
  const context = setup();
  assert.deepEqual(
    await runUpdateApplicationAction('acme', CASE_ID, { priority: 'urgent' }, context.dependencies),
    { ok: true, data: undefined },
  );
  assert.deepEqual(context.calls, [
    'auth',
    'tenant:acme',
    `active:${TENANT_ID}`,
    `update:${TENANT_ID}:${ACTOR_ID}:pro:${CASE_ID}`,
    'revalidate:/t/acme/applications',
    'revalidate:/t/acme/dashboard',
  ]);
});

test('application actions serialize tenant, active-state, and data ApiErrors', async () => {
  const missing = setup({ resolveTenant: async () => null });
  assert.deepEqual(await runCreateApplicationAction('missing', validCreate, missing.dependencies), {
    ok: false,
    error: 'Tenant not found',
    code: 'TENANT_NOT_FOUND',
  });

  const inactive = setup({
    requireActive: async () => {
      throw new ApiError('TENANT_INACTIVE', 'Workspace suspended', 403);
    },
  });
  assert.deepEqual(await runCreateApplicationAction('acme', validCreate, inactive.dependencies), {
    ok: false,
    error: 'Workspace suspended',
    code: 'TENANT_INACTIVE',
  });

  const database = setup({
    createCase: async () => {
      throw new ApiError('INTERNAL', 'Could not create application', 500);
    },
  });
  assert.deepEqual(await runCreateApplicationAction('acme', validCreate, database.dependencies), {
    ok: false,
    error: 'Could not create application',
    code: 'INTERNAL',
  });
});
