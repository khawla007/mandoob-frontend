import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  parseDubaiDateTimeLocal,
  runCreateApplicationAction,
  runUpdateApplicationAction,
  type ApplicationActionDependencies,
} from './action-logic';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const CASE_ID = '55555555-5555-4555-8555-555555555555';

function setup(overrides: Partial<ApplicationActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: ApplicationActionDependencies = {
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
    createCase: async (ctx) => {
      calls.push(`create:${ctx.tenantId}:${ctx.actorId}:${ctx.role}`);
      return { id: CASE_ID };
    },
    updateCase: async (ctx, id) => {
      calls.push(`update:${ctx.tenantId}:${ctx.companyId}:${ctx.actorId}:${ctx.role}:${id}`);
    },
    revalidate: (path) => {
      calls.push(`revalidate:${path}`);
    },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    ...overrides,
  };
  return { calls, dependencies };
}

const validCreate = {
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
    { company_id: OTHER_TENANT_ID, title: '', service_type: '' },
    context.dependencies,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'VALIDATION_FAILED');
  assert.deepEqual(context.calls, [
    'auth',
    'tenant:acme',
    `active:${TENANT_ID}`,
    `company:${ACTOR_ID}:acme`,
  ]);
});

test('create action rejects a company assignment outside the authorized tenant', async () => {
  const context = setup({
    resolveAssignedCompany: async () => ({ id: COMPANY_ID, tenantId: OTHER_TENANT_ID }),
  });

  assert.deepEqual(await runCreateApplicationAction('acme', validCreate, context.dependencies), {
    ok: false,
    error: 'No active company assignment',
    code: 'FORBIDDEN',
  });
  assert.equal(
    context.calls.some((call) => call.startsWith('create:')),
    false,
  );
});

test('update action returns validation errors without calling the data mutation', async () => {
  const context = setup();
  const result = await runUpdateApplicationAction(
    'acme',
    CASE_ID,
    { status: 'unknown' },
    context.dependencies,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'VALIDATION_FAILED');
  assert.equal(
    context.calls.some((call) => call.startsWith('update:')),
    false,
  );
});

test('update action denies a stale cross-company assignment before mutation', async () => {
  const context = setup({
    resolveAssignedCompany: async () => ({ id: COMPANY_ID, tenantId: OTHER_TENANT_ID }),
  });
  assert.deepEqual(
    await runUpdateApplicationAction('acme', CASE_ID, { priority: 'urgent' }, context.dependencies),
    { ok: false, error: 'No active company assignment', code: 'FORBIDDEN' },
  );
  assert.equal(
    context.calls.some((call) => call.startsWith('update:')),
    false,
  );
});

test('Dubai datetime-local parser applies UTC+04:00 and rejects impossible dates', () => {
  assert.equal(parseDubaiDateTimeLocal('2026-08-11T09:30'), '2026-08-11T09:30:00+04:00');
  assert.equal(parseDubaiDateTimeLocal('2026-02-29T09:30'), null);
  assert.equal(parseDubaiDateTimeLocal('2026-08-11T24:00'), null);
  assert.equal(parseDubaiDateTimeLocal('not-a-date'), null);
});

test('create action converts datetime-local values as Dubai business time', async () => {
  let input: Record<string, unknown> | undefined;
  const context = setup({
    createCase: async (_ctx, raw) => {
      input = raw as Record<string, unknown>;
      return { id: CASE_ID };
    },
  });
  const form = new FormData();
  form.set('company_id', OTHER_TENANT_ID);
  form.set('title', 'Investor visa application');
  form.set('service_type', 'Investor visa');
  form.set('due_at', '2026-08-11T09:30');
  form.set('sla_due_at', '2026-08-12T17:45');

  const result = await runCreateApplicationAction('acme', form, context.dependencies);
  assert.equal(result.ok, true);
  assert.equal(input?.due_at, '2026-08-11T09:30:00+04:00');
  assert.equal(input?.sla_due_at, '2026-08-12T17:45:00+04:00');
  assert.equal(input?.company_id, COMPANY_ID);
});

test('create action derives the assignee from the authorized PRO and ignores a spoofed profile id', async () => {
  let input: Record<string, unknown> | undefined;
  const context = setup({
    createCase: async (_ctx, raw) => {
      input = raw as Record<string, unknown>;
      return { id: CASE_ID };
    },
  });

  const result = await runCreateApplicationAction(
    'acme',
    { ...validCreate, assigned_to: OTHER_TENANT_ID },
    context.dependencies,
  );

  assert.deepEqual(result, { ok: true, data: { id: CASE_ID } });
  assert.equal(input?.assigned_to, ACTOR_ID);
});

test('update action ignores a spoofed assignee while retaining the assigned-company case scope', async () => {
  let input: Record<string, unknown> | undefined;
  const context = setup({
    updateCase: async (_ctx, _id, raw) => {
      input = raw as Record<string, unknown>;
    },
  });

  const result = await runUpdateApplicationAction(
    'acme',
    CASE_ID,
    { priority: 'high', assigned_to: OTHER_TENANT_ID },
    context.dependencies,
  );

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.equal(input?.priority, 'high');
  assert.equal(Object.hasOwn(input ?? {}, 'assigned_to'), false);
});

test('create action rejects an invalid datetime-local value before mutation', async () => {
  const context = setup();
  const form = new FormData();
  form.set('title', 'Investor visa application');
  form.set('service_type', 'Investor visa');
  form.set('due_at', '2026-02-29T09:30');

  const result = await runCreateApplicationAction('acme', form, context.dependencies);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'VALIDATION_FAILED');
  assert.equal(
    context.calls.some((call) => call.startsWith('create:')),
    false,
  );
});

test('status update ignores spoofed completion time and generates it on the server', async () => {
  let input: Record<string, unknown> | undefined;
  const context = setup({
    now: () => new Date('2026-08-11T12:34:56.000Z'),
    updateCase: async (_ctx, _id, raw) => {
      input = raw as Record<string, unknown>;
    },
  });

  await runUpdateApplicationAction(
    'acme',
    CASE_ID,
    { status: 'completed', completed_at: '2000-01-01T00:00:00.000Z' },
    context.dependencies,
  );
  assert.equal(input?.status, 'completed');
  assert.equal(input?.completed_at, '2026-08-11T12:34:56.000Z');

  await runUpdateApplicationAction(
    'acme',
    CASE_ID,
    { status: 'cancelled', completed_at: '2000-01-01T00:00:00.000Z' },
    context.dependencies,
  );
  assert.equal(input?.status, 'cancelled');
  assert.equal(input?.completed_at, null);
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
    `company:${ACTOR_ID}:acme`,
    `create:${TENANT_ID}:${ACTOR_ID}:pro`,
    'revalidate:/t/acme/applications',
    'revalidate:/t/acme/company',
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
    `company:${ACTOR_ID}:acme`,
    `update:${TENANT_ID}:${COMPANY_ID}:${ACTOR_ID}:pro:${CASE_ID}`,
    'revalidate:/t/acme/applications',
    'revalidate:/t/acme/company',
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
