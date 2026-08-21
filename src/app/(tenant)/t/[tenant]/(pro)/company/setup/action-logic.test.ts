import assert from 'node:assert/strict';
import test from 'node:test';

import type { OnboardingMutationResult } from '@/lib/data/company-onboarding-mutations';
import {
  createOnboardingActionState,
  runProCompanyOnboardingAction,
  type OnboardingActionKind,
  type ProOnboardingActionDependencies,
} from './action-logic';

const actorId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const nextOperationId = '55555555-5555-4555-8555-555555555555';
const rowId = '66666666-6666-4666-8666-666666666666';

const actionKinds: OnboardingActionKind[] = [
  'legal',
  'shareholders',
  'activities',
  'office',
  'establishment',
  'bank',
  'clearBankIdentifier',
  'reopen',
  'submit',
  'activate',
];

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function validForm(kind: OnboardingActionKind): FormData {
  const values: Record<OnboardingActionKind, Record<string, string>> = {
    legal: {
      completeSection: 'true',
      companyName: 'Acme Trading LLC',
      displayName: 'Acme',
      jurisdictionType: 'mainland',
      licensingAuthority: 'Dubai DET',
      legalStructure: 'llc',
      tradeLicenseNo: 'DET-1234',
      licenseExpiry: '2027-08-21',
    },
    shareholders: {
      completeSection: 'true',
      shareholders: JSON.stringify([
        {
          id: rowId,
          kind: 'individual',
          fullName: 'Aisha Khan',
          nationalityCode: 'AE',
          passportNumber: 'P1234567',
          ownershipPercent: '100.0000',
          sortOrder: 0,
        },
      ]),
    },
    activities: {
      completeSection: 'true',
      activities: JSON.stringify([
        {
          id: rowId,
          activityCode: '6201',
          activityName: 'Software services',
          authorityName: 'Dubai DET',
          isPrimary: true,
          sortOrder: 0,
        },
      ]),
    },
    office: {
      completeSection: 'true',
      officeType: 'virtual',
      addressLine1: '',
      addressLine2: '',
      area: '',
      city: 'Dubai',
      emirate: 'Dubai',
      postalCode: '',
      countryCode: 'AE',
      providerName: 'Workspace UAE',
      leaseReference: '',
      leaseExpiry: '',
    },
    establishment: {
      completeSection: 'true',
      establishmentCardNumber: 'EST-9988',
      establishmentCardExpiry: '2027-08-21',
    },
    bank: {
      completeSection: 'true',
      bankName: 'Example Bank',
      branchName: 'Dubai',
      accountHolderName: 'Acme Trading LLC',
      currencyCode: 'AED',
      swiftBic: 'ABCDEFGH',
      iban: 'AE070331234567890123456',
      accountNumber: '',
    },
    clearBankIdentifier: {
      identifier: 'iban',
      companyNameConfirmation: 'Acme Trading LLC',
    },
    reopen: {
      section: 'legal',
      reason: 'Correct the legal record',
      companyNameConfirmation: 'Acme Trading LLC',
    },
    submit: {},
    activate: {},
  };
  return form(values[kind]);
}

function setup(result?: OnboardingMutationResult) {
  const calls: string[] = [];
  const operationIds: string[] = [nextOperationId, nextOperationId];
  const dependencies: ProOnboardingActionDependencies = {
    authorize: async (slug) => {
      calls.push(`auth:${slug}`);
      return { actorProfileId: actorId, tenantId, tenantSlug: 'acme' };
    },
    read: async (scope) => {
      calls.push(`read:${scope.actorProfileId}:${scope.tenantId}:${scope.companyId}`);
      return {
        companyId,
        tenantId,
        companyName: 'Acme Trading LLC',
        onboardingVersion: 7,
      };
    },
    mutate: async (kind, input) => {
      calls.push(
        `mutate:${kind}:${input.actorProfileId}:${input.tenantId}:${input.companyId}:${input.operationId}:${input.expectedVersion}`,
      );
      return (
        result ?? {
          ok: true,
          companyId,
          onboardingVersion: 8,
          ...(kind === 'submit' ? { ready: true, requirements: [] } : {}),
          ...(kind === 'activate' ? { activated: true, requirements: [] } : {}),
        }
      );
    },
    createOperationId: () => operationIds.shift() ?? nextOperationId,
    revalidate: (path) => calls.push(`revalidate:${path}`),
    redirect: (path) => calls.push(`redirect:${path}`),
    reportError: (event) => calls.push(`report:${event}`),
  };
  return { calls, dependencies };
}

test('initial state receives a server-generated retry operation UUID', () => {
  assert.deepEqual(
    createOnboardingActionState(7, () => operationId),
    {
      status: 'idle',
      version: 7,
      operationId,
    },
  );
});

test('every PRO action authorizes, verifies exact scope, and invokes one mutation', async () => {
  for (const kind of actionKinds) {
    const context = setup();
    const result = await runProCompanyOnboardingAction(
      {
        kind,
        tenantSlug: 'acme',
        companyId,
        previousState: createOnboardingActionState(7, () => operationId),
        formData: validForm(kind),
      },
      context.dependencies,
    );
    assert.equal(result.status, 'saved', kind);
    assert.equal(result.version, 8, kind);
    assert.equal(result.operationId, nextOperationId, kind);
    assert.deepEqual(context.calls.slice(0, 3), [
      'auth:acme',
      `read:${actorId}:${tenantId}:${companyId}`,
      `mutate:${kind}:${actorId}:${tenantId}:${companyId}:${operationId}:7`,
    ]);
    assert.equal(context.calls.filter((call) => call.startsWith('mutate:')).length, 1, kind);
  }
});

test('authorization denial and released assignment stop before service-role reads', async () => {
  const denied = setup();
  denied.dependencies.authorize = async () => {
    denied.calls.push('auth');
    throw new Error('DENIED');
  };
  await assert.rejects(
    () =>
      runProCompanyOnboardingAction(
        {
          kind: 'legal',
          tenantSlug: 'acme',
          companyId,
          previousState: createOnboardingActionState(7, () => operationId),
          formData: validForm('legal'),
        },
        denied.dependencies,
      ),
    /DENIED/,
  );
  assert.deepEqual(denied.calls, ['auth']);

  const released = setup();
  released.dependencies.read = async () => null;
  const result = await runProCompanyOnboardingAction(
    {
      kind: 'legal',
      tenantSlug: 'acme',
      companyId,
      previousState: createOnboardingActionState(7, () => operationId),
      formData: validForm('legal'),
    },
    released.dependencies,
  );
  assert.equal(result.status, 'error');
  assert.equal(result.status === 'error' ? result.code : '', 'ASSIGNMENT_NOT_FOUND');
  assert.equal(
    released.calls.some((call) => call.startsWith('mutate:')),
    false,
  );
});

test('reassigned and cross-company snapshots fail closed', async () => {
  const context = setup();
  context.dependencies.read = async () => ({
    companyId: rowId,
    tenantId,
    companyName: 'Other Company',
    onboardingVersion: 7,
  });
  const result = await runProCompanyOnboardingAction(
    {
      kind: 'submit',
      tenantSlug: 'acme',
      companyId,
      previousState: createOnboardingActionState(7, () => operationId),
      formData: validForm('submit'),
    },
    context.dependencies,
  );
  assert.equal(result.status === 'error' ? result.code : '', 'ASSIGNMENT_NOT_FOUND');
  assert.equal(
    context.calls.some((call) => call.startsWith('mutate:')),
    false,
  );
});

test('every action rejects invalid form or command state before mutation', async () => {
  for (const kind of actionKinds) {
    const context = setup();
    const state = createOnboardingActionState(
      kind === 'submit' || kind === 'activate' ? -1 : 7,
      () => operationId,
    );
    const result = await runProCompanyOnboardingAction(
      {
        kind,
        tenantSlug: 'acme',
        companyId,
        previousState: state,
        formData: kind === 'submit' || kind === 'activate' ? validForm(kind) : form(),
      },
      context.dependencies,
    );
    assert.equal(result.status, 'error', kind);
    assert.equal(result.status === 'error' ? result.code : '', 'INVALID_SECTION_INPUT', kind);
    assert.equal(
      context.calls.some((call) => call.startsWith('mutate:')),
      false,
      kind,
    );
  }
});

test('stable mutation failures are sanitized and never revalidate or redirect', async () => {
  const mappings = [
    ['conflict', 'STALE_ONBOARDING_VERSION'],
    ['operationConflict', 'OPERATION_REUSED'],
    ['inactive', 'COMPANY_INACTIVE'],
    ['incomplete', 'SECTION_NOT_COMPLETABLE'],
    ['invalidState', 'ONBOARDING_NOT_SUBMITTABLE'],
    ['unexpected', 'INTERNAL'],
  ] as const;
  for (const [internal, expected] of mappings) {
    const context = setup({ ok: false, code: internal });
    const result = await runProCompanyOnboardingAction(
      {
        kind: 'bank',
        tenantSlug: 'acme',
        companyId,
        previousState: createOnboardingActionState(7, () => operationId),
        formData: validForm('bank'),
      },
      context.dependencies,
    );
    assert.equal(result.status === 'error' ? result.code : '', expected);
    assert.equal(JSON.stringify(result).includes('AE070331234567890123456'), false);
    assert.equal(
      context.calls.some((call) => call.startsWith('revalidate:')),
      false,
    );
    assert.equal(
      context.calls.some((call) => call.startsWith('redirect:')),
      false,
    );
  }
});

test('readiness failures return only authorized requirement codes', async () => {
  const context = setup({
    ok: true,
    companyId,
    onboardingVersion: 7,
    ready: false,
    requirements: [{ code: 'BANK_ACCOUNT_MISSING', section: 'bank', state: 'missing' }],
  });
  const result = await runProCompanyOnboardingAction(
    {
      kind: 'submit',
      tenantSlug: 'acme',
      companyId,
      previousState: createOnboardingActionState(7, () => operationId),
      formData: validForm('submit'),
    },
    context.dependencies,
  );
  assert.deepEqual(result, {
    status: 'error',
    version: 7,
    operationId: nextOperationId,
    code: 'COMPANY_NOT_READY',
    requirements: ['BANK_ACCOUNT_MISSING'],
  });
});

test('same-tick duplicates reuse one operation UUID and remain replay-safe', async () => {
  const context = setup();
  const previousState = createOnboardingActionState(7, () => operationId);
  await Promise.all([
    runProCompanyOnboardingAction(
      { kind: 'legal', tenantSlug: 'acme', companyId, previousState, formData: validForm('legal') },
      context.dependencies,
    ),
    runProCompanyOnboardingAction(
      { kind: 'legal', tenantSlug: 'acme', companyId, previousState, formData: validForm('legal') },
      context.dependencies,
    ),
  ]);
  const mutations = context.calls.filter((call) => call.startsWith('mutate:'));
  assert.equal(mutations.length, 2);
  assert.equal(
    mutations.every((call) => call.includes(`:${operationId}:7`)),
    true,
  );
});

test('success revalidates exact PRO routes and redirects final actions after revalidation', async () => {
  for (const kind of actionKinds) {
    const context = setup();
    await runProCompanyOnboardingAction(
      {
        kind,
        tenantSlug: 'acme',
        companyId,
        previousState: createOnboardingActionState(7, () => operationId),
        formData: validForm(kind),
      },
      context.dependencies,
    );
    const tail = context.calls.slice(3);
    assert.deepEqual(tail.slice(0, 3), [
      'revalidate:/t/acme/company/setup',
      'revalidate:/t/acme/company',
      'revalidate:/t/acme/dashboard',
    ]);
    assert.deepEqual(
      tail.slice(3),
      kind === 'submit' || kind === 'activate' ? ['redirect:/t/acme/company'] : [],
    );
  }
});

test('Save and Continue redirects to the next fixed section without query state', async () => {
  const context = setup();
  const data = validForm('legal');
  data.set('intent', 'continue');
  await runProCompanyOnboardingAction(
    {
      kind: 'legal',
      tenantSlug: 'acme',
      companyId,
      previousState: createOnboardingActionState(7, () => operationId),
      formData: data,
    },
    context.dependencies,
  );
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('redirect:')),
    ['redirect:/t/acme/company/setup/shareholders'],
  );

  const saveContext = setup();
  await runProCompanyOnboardingAction(
    {
      kind: 'legal',
      tenantSlug: 'acme',
      companyId,
      previousState: createOnboardingActionState(7, () => operationId),
      formData: validForm('legal'),
    },
    saveContext.dependencies,
  );
  assert.equal(
    saveContext.calls.some((call) => call.startsWith('redirect:')),
    false,
  );
});
