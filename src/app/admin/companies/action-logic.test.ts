import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  runAssignCompanyProAction,
  runCreateCompanyAction,
  runReassignCompanyProAction,
  runReleaseCompanyProAction,
  type CompanyActionDependencies,
} from './action-logic';

const actorId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const oldProId = '55555555-5555-4555-8555-555555555555';
const replacementProId = '66666666-6666-4666-8666-666666666666';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function setup(role: 'admin' | 'super_admin' = 'admin') {
  const calls: string[] = [];
  const dependencies: CompanyActionDependencies = {
    requireActor: async () => {
      calls.push(`auth:${role}`);
      return { id: actorId, role };
    },
    provisionCompany: async () => {
      calls.push('provision');
      return { tenantId, companyId };
    },
    getCompany: async () => {
      calls.push('company');
      return {
        id: companyId,
        tenantId,
        tenantSlug: 'acme-trading',
        companyName: 'Acme Trading LLC',
      };
    },
    assign: async (_input, trustedActorId) => {
      calls.push(`assign:${trustedActorId}`);
      return {
        assignmentId,
        pricingTermId: '77777777-7777-4777-8777-777777777777',
        compensationTermId: '88888888-8888-4888-8888-888888888888',
        proProfileId: oldProId,
      };
    },
    release: async (_input, trustedActorId) => {
      calls.push(`release:${trustedActorId}`);
      return { assignmentId, previousProProfileId: oldProId };
    },
    reassign: async (_input, trustedActorId) => {
      calls.push(`reassign:${trustedActorId}`);
      return {
        assignmentId,
        pricingTermId: '77777777-7777-4777-8777-777777777777',
        compensationTermId: '88888888-8888-4888-8888-888888888888',
        proProfileId: replacementProId,
        previousProProfileId: oldProId,
      };
    },
    revalidate: (path) => calls.push(`revalidate:${path}`),
  };
  return { calls, dependencies };
}

const createData = () =>
  form({ companyName: 'Acme Trading LLC', slug: 'acme-trading', plan: 'starter' });
const assignData = () => form({ companyId, proProfileId: oldProId });
const releaseData = () =>
  form({
    companyId,
    assignmentId,
    companyNameConfirmation: 'Acme Trading LLC',
    reason: 'Contract ended',
  });
const reassignData = () =>
  form({
    companyId,
    assignmentId,
    replacementProProfileId: replacementProId,
    reason: 'Coverage change',
  });

for (const role of ['admin', 'super_admin'] as const) {
  test(`${role} can create a company and revalidates every affected route`, async () => {
    const context = setup(role);
    const result = await runCreateCompanyAction(createData(), context.dependencies);
    assert.deepEqual(result, { ok: true, data: { tenantId, companyId } });
    assert.deepEqual(context.calls, [
      `auth:${role}`,
      'provision',
      'revalidate:/admin/companies',
      `revalidate:/admin/companies/${companyId}`,
      `revalidate:/admin/companies/${companyId}/onboarding`,
      'revalidate:/admin/users',
      'revalidate:/t/acme-trading',
      'revalidate:/t/acme-trading/company',
      'revalidate:/t/acme-trading/company/setup',
      'revalidate:/t/acme-trading/dashboard',
    ]);
  });
}

test('invalid assignment payload authenticates but never reads or mutates data', async () => {
  const context = setup();
  const result = await runAssignCompanyProAction(
    form({ companyId: 'not-a-uuid', proProfileId: oldProId, actorId: replacementProId }),
    context.dependencies,
  );
  assert.deepEqual(result, {
    ok: false,
    error: 'Invalid company assignment input',
    code: 'VALIDATION_FAILED',
    fieldErrors: { companyId: 'invalid' },
  });
  assert.deepEqual(context.calls, ['auth:admin']);
});

test('assignment identifies an invalid editable PRO field', async () => {
  const context = setup();
  const result = await runAssignCompanyProAction(
    form({ companyId, proProfileId: 'not-a-uuid' }),
    context.dependencies,
  );
  assert.deepEqual(result, {
    ok: false,
    error: 'Invalid company assignment input',
    code: 'VALIDATION_FAILED',
    fieldErrors: { proProfileId: 'invalid' },
  });
  assert.deepEqual(context.calls, ['auth:admin']);
});

test('create returns field-specific validation markers without raw schema messages', async () => {
  const context = setup();
  const result = await runCreateCompanyAction(
    form({ companyName: 'x', slug: 'BAD SLUG', plan: 'unknown' }),
    context.dependencies,
  );
  assert.deepEqual(result, {
    ok: false,
    error: 'Unable to create company workspace',
    code: 'VALIDATION_FAILED',
    fieldErrors: { companyName: 'invalid', slug: 'invalid', plan: 'invalid' },
  });
  assert.deepEqual(context.calls, ['auth:admin']);
});

test('assignment uses the authoritative actor and exact revalidation routes', async () => {
  const context = setup();
  const data = assignData();
  data.set('actorId', replacementProId);
  assert.deepEqual(await runAssignCompanyProAction(data, context.dependencies), {
    ok: true,
    data: { assignmentId, outcome: 'assigned' },
  });
  assert.deepEqual(context.calls, [
    'auth:admin',
    'company',
    `assign:${actorId}`,
    'revalidate:/admin/companies',
    `revalidate:/admin/companies/${companyId}`,
    `revalidate:/admin/companies/${companyId}/onboarding`,
    'revalidate:/admin/users',
    `revalidate:/admin/users/${oldProId}`,
    'revalidate:/t/acme-trading',
    'revalidate:/t/acme-trading/company',
    'revalidate:/t/acme-trading/company/setup',
    'revalidate:/t/acme-trading/dashboard',
  ]);
});

test('release requires the exact company name and does not mutate on mismatch', async () => {
  const context = setup();
  const data = releaseData();
  data.set('companyNameConfirmation', 'acme trading llc');
  assert.deepEqual(await runReleaseCompanyProAction(data, context.dependencies), {
    ok: false,
    error: 'Company name confirmation does not match',
    code: 'CONFIRMATION_MISMATCH',
    fieldErrors: { companyNameConfirmation: 'mismatch' },
  });
  assert.deepEqual(context.calls, ['auth:admin', 'company']);
});

test('release and reassignment identify invalid editable fields', async () => {
  const release = setup();
  const badRelease = releaseData();
  badRelease.set('reason', 'no');
  assert.deepEqual(await runReleaseCompanyProAction(badRelease, release.dependencies), {
    ok: false,
    error: 'Invalid company release input',
    code: 'VALIDATION_FAILED',
    fieldErrors: { reason: 'invalid' },
  });

  const reassign = setup();
  const badReassign = reassignData();
  badReassign.set('replacementProProfileId', 'bad');
  assert.deepEqual(await runReassignCompanyProAction(badReassign, reassign.dependencies), {
    ok: false,
    error: 'Unable to update company assignment',
    code: 'VALIDATION_FAILED',
    fieldErrors: { replacementProProfileId: 'invalid' },
  });
});

test('release requires a reason and revalidates only after success', async () => {
  const invalid = setup();
  const invalidData = releaseData();
  invalidData.set('reason', ' ');
  assert.equal((await runReleaseCompanyProAction(invalidData, invalid.dependencies)).ok, false);
  assert.deepEqual(invalid.calls, ['auth:admin']);

  const valid = setup();
  assert.deepEqual(await runReleaseCompanyProAction(releaseData(), valid.dependencies), {
    ok: true,
    data: { outcome: 'released' },
  });
  assert.deepEqual(valid.calls.slice(0, 3), ['auth:admin', 'company', `release:${actorId}`]);
  assert.deepEqual(valid.calls.slice(3), [
    'revalidate:/admin/companies',
    `revalidate:/admin/companies/${companyId}`,
    `revalidate:/admin/companies/${companyId}/onboarding`,
    'revalidate:/admin/users',
    `revalidate:/admin/users/${oldProId}`,
    'revalidate:/t/acme-trading',
    'revalidate:/t/acme-trading/company',
    'revalidate:/t/acme-trading/company/setup',
    'revalidate:/t/acme-trading/dashboard',
  ]);
});

test('reassignment uses the replacement PRO and authoritative actor', async () => {
  const context = setup();
  assert.deepEqual(await runReassignCompanyProAction(reassignData(), context.dependencies), {
    ok: true,
    data: { assignmentId, outcome: 'reassigned' },
  });
  assert.deepEqual(context.calls.slice(0, 3), ['auth:admin', 'company', `reassign:${actorId}`]);
});

test('assignment mutations revalidate exact server-returned old and new PRO details', async () => {
  const assigned = setup();
  await runAssignCompanyProAction(assignData(), assigned.dependencies);
  assert.ok(assigned.calls.includes(`revalidate:/admin/users/${oldProId}`));

  const released = setup();
  await runReleaseCompanyProAction(releaseData(), released.dependencies);
  assert.ok(released.calls.includes(`revalidate:/admin/users/${oldProId}`));

  const reassigned = setup();
  await runReassignCompanyProAction(reassignData(), reassigned.dependencies);
  assert.ok(reassigned.calls.includes(`revalidate:/admin/users/${oldProId}`));
  assert.ok(reassigned.calls.includes(`revalidate:/admin/users/${replacementProId}`));
});

test('domain conflicts are sanitized and duplicate submissions remain replay-safe', async () => {
  let attempts = 0;
  const context = setup();
  context.dependencies.assign = async () => {
    attempts += 1;
    throw new ApiError(
      'COMPANY_ALREADY_ASSIGNED',
      'duplicate key violates unique constraint pro_company_assignments_company_id_key',
      409,
    );
  };
  const first = await runAssignCompanyProAction(assignData(), context.dependencies);
  const second = await runAssignCompanyProAction(assignData(), context.dependencies);
  assert.deepEqual(first, {
    ok: false,
    error: 'Unable to update company assignment',
    code: 'COMPANY_ALREADY_ASSIGNED',
  });
  assert.deepEqual(second, first);
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(first).includes('unique constraint'), false);
  assert.equal(
    context.calls.some((call) => call.startsWith('revalidate:')),
    false,
  );
});

test('unexpected errors never expose database details', async () => {
  const context = setup();
  context.dependencies.reassign = async () => {
    throw new Error('postgres password and row detail');
  };
  const result = await runReassignCompanyProAction(reassignData(), context.dependencies);
  assert.deepEqual(result, {
    ok: false,
    error: 'Unable to update company assignment',
    code: 'INTERNAL',
  });
  assert.equal(JSON.stringify(result).includes('postgres'), false);
});
