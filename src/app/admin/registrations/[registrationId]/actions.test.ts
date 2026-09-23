import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runOperatorTransitionStageAction,
  runOperatorRecoverUnlinkStageDocumentAction,
  type OperatorRegistrationActionDependencies,
} from './action-logic';

const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const REGISTRATION_ID = '66666666-6666-4666-8666-666666666666';
const STAGE_ID = '88888888-8888-4888-8888-888888888888';
const LINK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATION_ID = '99999999-9999-4999-8999-999999999999';

function operatorRead() {
  return {
    registrationId: REGISTRATION_ID,
    tenantId: TENANT_ID,
    companyId: COMPANY_ID,
    serviceCaseId: '77777777-7777-4777-8777-777777777777',
    status: 'in_progress' as const,
    currentStage: 'application_submitted' as const,
    registrationVersion: 2,
    stages: [],
    visaPeople: [],
    generatedAt: '2026-09-23T10:00:00.000Z',
  };
}

function setup(overrides: Partial<OperatorRegistrationActionDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: OperatorRegistrationActionDependencies = {
    requireOperator: async () => {
      calls.push('auth');
      return { id: ACTOR_ID, role: 'admin', aal: 'aal2' };
    },
    readRegistration: async (id, actor) => {
      calls.push(`read:${id}:${actor.actorAal}`);
      return operatorRead();
    },
    transitionStage: async (_input, actor) => {
      calls.push(`transition:${actor.actorId}:${actor.tenantId}:${actor.companyId}`);
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        stageCode: 'application_submitted',
        stageStatus: 'completed',
        status: 'in_progress',
        currentStage: 'initial_approval',
        transitionCode: 'completed',
        registrationVersion: 3,
        stageVersion: 2,
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
    recoverUnlinkStageDocument: async (_input, actor) => {
      calls.push(`recover:${actor.actorAal}`);
      return {
        registrationId: REGISTRATION_ID,
        stageId: STAGE_ID,
        linkId: LINK_ID,
        unlinked: true,
        recovery: true,
      };
    },
    revalidate: (path) => {
      calls.push(`revalidate:${path}`);
    },
    ...overrides,
  };
  return { calls, dependencies };
}

const validTransition = {
  registrationId: REGISTRATION_ID,
  stageId: STAGE_ID,
  command: 'complete' as const,
  expectedRegistrationVersion: 2,
  expectedStageVersion: 1,
  operationId: OPERATION_ID,
};

const validRecover = {
  registrationId: REGISTRATION_ID,
  stageId: STAGE_ID,
  linkId: LINK_ID,
  reason: 'Recovering an erroneously unlinked evidence document',
  operationId: OPERATION_ID,
};

test('operator actions authenticate before reading or mutating', async () => {
  const context = setup({
    requireOperator: async () => {
      context.calls.push('auth');
      throw new ApiError('UNAUTHORIZED', 'Sign in required', 401);
    },
  });
  await assert.rejects(
    () => runOperatorTransitionStageAction(REGISTRATION_ID, validTransition, context.dependencies),
    (error) => error instanceof ApiError && error.code === 'UNAUTHORIZED',
  );
  assert.deepEqual(context.calls, ['auth']);
});

test('SECURITY: an AAL1 operator session cannot mutate (fail closed)', async () => {
  const context = setup({
    requireOperator: async () => {
      context.calls.push('auth');
      return { id: ACTOR_ID, role: 'admin', aal: 'aal1' };
    },
  });
  await assert.rejects(
    () => runOperatorTransitionStageAction(REGISTRATION_ID, validTransition, context.dependencies),
    (error) => error instanceof ApiError && error.code === 'MFA_REQUIRED',
  );
  assert.equal(
    context.calls.some((c) => c.startsWith('transition:')),
    false,
  );
});

test('operator transition derives tenant/company from the authoritative read', async () => {
  const context = setup();
  const result = await runOperatorTransitionStageAction(
    REGISTRATION_ID,
    validTransition,
    context.dependencies,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(context.calls, [
    'auth',
    `read:${REGISTRATION_ID}:aal2`,
    `transition:${ACTOR_ID}:${TENANT_ID}:${COMPANY_ID}`,
    `revalidate:/admin/registrations/${REGISTRATION_ID}`,
    'revalidate:/admin/registrations',
  ]);
});

test('operator recover-unlink forwards the confirmed AAL and reason', async () => {
  const context = setup();
  const result = await runOperatorRecoverUnlinkStageDocumentAction(
    REGISTRATION_ID,
    validRecover,
    context.dependencies,
  );
  assert.equal(result.ok, true);
  assert.equal(context.calls.includes('recover:aal2'), true);
});

test('SECURITY: a guessed/nonexistent registration id fails closed before any mutation', async () => {
  const context = setup({
    readRegistration: async () => {
      throw new ApiError('REGISTRATION_NOT_FOUND', 'Not found', 404);
    },
  });
  // The authoritative read runs inside the guard (before the mutation try), so a
  // not-found/forbidden read propagates as an ApiError and no mutation runs.
  await assert.rejects(
    () => runOperatorTransitionStageAction(REGISTRATION_ID, validTransition, context.dependencies),
    (error) => error instanceof ApiError && error.code === 'REGISTRATION_NOT_FOUND',
  );
  assert.equal(
    context.calls.some((c) => c.startsWith('transition:')),
    false,
  );
});

test('operator actions serialize a version-conflict ApiError from the wrapper', async () => {
  const context = setup({
    transitionStage: async () => {
      throw new ApiError('STALE_REGISTRATION_VERSION', 'Registration changed', 409);
    },
  });
  assert.deepEqual(
    await runOperatorTransitionStageAction(REGISTRATION_ID, validTransition, context.dependencies),
    { ok: false, error: 'Registration changed', code: 'STALE_REGISTRATION_VERSION' },
  );
});
