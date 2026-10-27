import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runCreateRegistrationAction,
  runTransitionStageAction,
  runCreateVisaPersonAction,
  runLinkStageDocumentAction,
  type RegistrationActionDependencies,
} from './action-logic';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const REGISTRATION_ID = '66666666-6666-4666-8666-666666666666';
const STAGE_ID = '88888888-8888-4888-8888-888888888888';
const OPERATION_ID = '99999999-9999-4999-8999-999999999999';
const DOCUMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function setup(overrides: Partial<RegistrationActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: RegistrationActionDependencies = {
    requirePro: async () => {
      calls.push('auth');
      return { id: ACTOR_ID, role: 'pro', tenantId: TENANT_ID, aal: 'aal1' };
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
    createRegistration: async (_input, actor) => {
      calls.push(`create:${actor.actorId}:${actor.tenantId}:${actor.companyId}`);
      return {
        registrationId: REGISTRATION_ID,
        serviceCaseId: '77777777-7777-4777-8777-777777777777',
        status: 'in_progress',
        currentStage: 'application_submitted',
        registrationVersion: 1,
        currentStageVersion: 1,
      };
    },
    transitionStage: async (_input, actor) => {
      calls.push(
        `transition:${actor.actorId}:${actor.tenantId}:${actor.companyId}:${actor.actorAal}`,
      );
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        stageCode: 'application_submitted',
        stageStatus: 'completed',
        status: 'in_progress',
        currentStage: 'initial_approval',
        transitionCode: 'completed',
        registrationVersion: 2,
        stageVersion: 2,
      };
    },
    linkStageDocument: async (_input, actor) => {
      calls.push(`link:${actor.actorId}`);
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        linkId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        role: 'application_form',
      };
    },
    unlinkStageDocument: async () => {
      calls.push('unlink');
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        linkId: DOCUMENT_ID,
        unlinked: true,
      };
    },
    createVisaPerson: async (_input, actor) => {
      calls.push(`visa-create:${actor.actorId}`);
      return {
        registrationId: REGISTRATION_ID,
        visaPersonId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        displayName: 'Aisha Khan',
        personKind: 'shareholder',
        visaKind: 'investor',
        status: 'not_started',
        currentStage: 'documents_ready',
        visaVersion: 1,
      };
    },
    transitionVisaPerson: async () => {
      calls.push('visa-transition');
      return {
        registrationId: REGISTRATION_ID,
        visaPersonId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'in_progress',
        currentStage: 'entry_permit',
        visaVersion: 2,
      };
    },
    cancelVisaPerson: async () => {
      calls.push('visa-cancel');
      return {
        registrationId: REGISTRATION_ID,
        visaPersonId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'cancelled',
        currentStage: 'documents_ready',
        visaVersion: 3,
      };
    },
    revalidate: (path) => {
      calls.push(`revalidate:${path}`);
    },
    ...overrides,
  };
  return { calls, dependencies };
}

const validCreate = {
  companyId: COMPANY_ID,
  title: 'New LLC',
  priority: 'normal' as const,
  dueAt: null,
  operationId: OPERATION_ID,
};

const validTransition = {
  registrationId: REGISTRATION_ID,
  stageId: STAGE_ID,
  command: 'complete' as const,
  expectedRegistrationVersion: 1,
  expectedStageVersion: 1,
  operationId: OPERATION_ID,
};

test('registration actions authenticate before resolving tenant or mutating', async () => {
  const context = setup({
    requirePro: async () => {
      context.calls.push('auth');
      throw new ApiError('UNAUTHORIZED', 'Sign in required', 401);
    },
  });
  await assert.rejects(
    () => runCreateRegistrationAction('acme', validCreate, context.dependencies),
    (error) => error instanceof ApiError && error.code === 'UNAUTHORIZED',
  );
  assert.deepEqual(context.calls, ['auth']);
});

test('registration actions reject a slug/session tenant mismatch before active check or mutation', async () => {
  const context = setup({
    resolveTenant: async () => {
      context.calls.push('tenant:acme');
      return { id: OTHER_TENANT_ID };
    },
  });
  assert.deepEqual(await runCreateRegistrationAction('acme', validCreate, context.dependencies), {
    ok: false,
    error: 'Cross-tenant access denied',
    code: 'FORBIDDEN',
  });
  assert.deepEqual(context.calls, ['auth', 'tenant:acme']);
});

test('registration actions deny a company assignment outside the authorized tenant', async () => {
  const context = setup({
    resolveAssignedCompany: async () => ({ id: COMPANY_ID, tenantId: OTHER_TENANT_ID }),
  });
  assert.deepEqual(await runTransitionStageAction('acme', validTransition, context.dependencies), {
    ok: false,
    error: 'No active company assignment',
    code: 'FORBIDDEN',
  });
  assert.equal(
    context.calls.some((c) => c.startsWith('transition:')),
    false,
  );
});

test('registration actions deny when the PRO has no active assignment (released/reassigned)', async () => {
  const context = setup({ resolveAssignedCompany: async () => null });
  assert.deepEqual(await runTransitionStageAction('acme', validTransition, context.dependencies), {
    ok: false,
    error: 'No active company assignment',
    code: 'FORBIDDEN',
  });
});

test('create action derives the actor context from the trusted assignment and revalidates', async () => {
  const context = setup();
  const result = await runCreateRegistrationAction('acme', validCreate, context.dependencies);
  assert.deepEqual(result, {
    ok: true,
    data: {
      registrationId: REGISTRATION_ID,
      serviceCaseId: '77777777-7777-4777-8777-777777777777',
      status: 'in_progress',
      currentStage: 'application_submitted',
      registrationVersion: 1,
      currentStageVersion: 1,
    },
  });
  assert.deepEqual(context.calls, [
    'auth',
    'tenant:acme',
    `active:${TENANT_ID}`,
    `company:${ACTOR_ID}:acme`,
    `create:${ACTOR_ID}:${TENANT_ID}:${COMPANY_ID}`,
    'revalidate:/t/acme/applications/registration',
    'revalidate:/t/acme/applications',
    'revalidate:/t/acme/dashboard',
  ]);
});

test('transition action forwards the trusted actor and version-checked input', async () => {
  const context = setup();
  const result = await runTransitionStageAction('acme', validTransition, context.dependencies);
  assert.equal(result.ok, true);
  assert.equal(context.calls.includes(`transition:${ACTOR_ID}:${TENANT_ID}:${COMPANY_ID}:aal1`), true);
});

test('create->transition->link->visa idempotency: the operationId is preserved unmodified', async () => {
  let seenOperation: string | undefined;
  const context = setup({
    linkStageDocument: async (input) => {
      seenOperation = input.operationId;
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        linkId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        role: 'application_form',
      };
    },
  });
  await runCreateRegistrationAction('acme', validCreate, context.dependencies);
  await runTransitionStageAction('acme', validTransition, context.dependencies);
  const link = await runLinkStageDocumentAction(
    'acme',
    {
      registrationId: REGISTRATION_ID,
      stageId: STAGE_ID,
      documentId: DOCUMENT_ID,
      documentVersionId: VERSION_ID,
      role: 'application_form',
      operationId: OPERATION_ID,
    },
    context.dependencies,
  );
  const visa = await runCreateVisaPersonAction(
    'acme',
    {
      registrationId: REGISTRATION_ID,
      personKind: 'shareholder',
      visaKind: 'investor',
      shareholderId: '12121212-1212-4212-8212-121212121212',
      displayName: 'Aisha Khan',
      operationId: OPERATION_ID,
    },
    context.dependencies,
  );
  assert.equal(link.ok, true);
  assert.equal(visa.ok, true);
  assert.equal(seenOperation, OPERATION_ID);
});

test('registration actions serialize a version-conflict ApiError from the wrapper', async () => {
  const context = setup({
    transitionStage: async () => {
      throw new ApiError('STALE_STAGE_VERSION', 'Stage changed', 409);
    },
  });
  assert.deepEqual(await runTransitionStageAction('acme', validTransition, context.dependencies), {
    ok: false,
    error: 'Stage changed',
    code: 'STALE_STAGE_VERSION',
  });
});

test('registration actions serialize tenant-not-found and inactive-tenant errors', async () => {
  const missing = setup({ resolveTenant: async () => null });
  assert.deepEqual(
    await runCreateRegistrationAction('missing', validCreate, missing.dependencies),
    {
      ok: false,
      error: 'Tenant not found',
      code: 'TENANT_NOT_FOUND',
    },
  );

  const inactive = setup({
    requireActive: async () => {
      throw new ApiError('TENANT_INACTIVE', 'Workspace suspended', 403);
    },
  });
  assert.deepEqual(await runCreateRegistrationAction('acme', validCreate, inactive.dependencies), {
    ok: false,
    error: 'Workspace suspended',
    code: 'TENANT_INACTIVE',
  });
});
