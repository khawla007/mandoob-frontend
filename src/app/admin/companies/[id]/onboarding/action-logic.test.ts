import assert from 'node:assert/strict';
import test from 'node:test';

import type { OnboardingMutationResult } from '@/lib/data/company-onboarding-mutations';
import {
  createAdminOnboardingActionState,
  runAdminCompanyOnboardingAction,
  type AdminOnboardingActionDependencies,
  type AdminOnboardingActionKind,
} from './action-logic';

const actorId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const nextOperationId = '55555555-5555-4555-8555-555555555555';

const kinds: AdminOnboardingActionKind[] = [
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

function validForm(kind: AdminOnboardingActionKind): FormData {
  switch (kind) {
    case 'legal':
      return form({
        completeSection: 'true',
        companyName: 'Acme Trading LLC',
        displayName: 'Acme',
        jurisdictionType: 'mainland',
        licensingAuthority: 'Dubai DET',
        legalStructure: 'llc',
        tradeLicenseNo: 'DET-1234',
        licenseExpiry: '2027-08-21',
      });
    case 'shareholders':
      return form({
        completeSection: 'true',
        shareholders: JSON.stringify([
          {
            kind: 'individual',
            fullName: 'Aisha Khan',
            nationalityCode: 'AE',
            passportNumber: 'P1234567',
            ownershipPercent: '100.0000',
            sortOrder: 0,
          },
        ]),
      });
    case 'activities':
      return form({
        completeSection: 'true',
        activities: JSON.stringify([
          {
            activityCode: '6201',
            activityName: 'Software services',
            authorityName: 'Dubai DET',
            isPrimary: true,
            sortOrder: 0,
          },
        ]),
      });
    case 'office':
      return form({
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
      });
    case 'establishment':
      return form({
        completeSection: 'true',
        establishmentCardNumber: 'EST-9988',
        establishmentCardExpiry: '2027-08-21',
      });
    case 'bank':
      return form({
        completeSection: 'true',
        bankName: 'Example Bank',
        branchName: 'Dubai',
        accountHolderName: 'Acme Trading LLC',
        currencyCode: 'AED',
        swiftBic: 'ABCDEFGH',
        iban: 'AE070331234567890123456',
        accountNumber: '',
      });
    case 'clearBankIdentifier':
      return form({ identifier: 'iban', companyNameConfirmation: 'Acme Trading LLC' });
    case 'reopen':
      return form({
        section: 'legal',
        reason: 'Correct the legal record',
        companyNameConfirmation: 'Acme Trading LLC',
      });
    case 'submit':
    case 'activate':
      return form();
  }
}

function setup(result?: OnboardingMutationResult) {
  const calls: string[] = [];
  const dependencies: AdminOnboardingActionDependencies = {
    authorize: async () => {
      calls.push('auth');
      return { actorProfileId: actorId };
    },
    resolveCompany: async (id) => {
      calls.push(`resolve:${id}`);
      return { companyId, tenantId, tenantSlug: 'acme' };
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
    createOperationId: () => nextOperationId,
    revalidate: (path) => calls.push(`revalidate:${path}`),
    redirect: (path) => calls.push(`redirect:${path}`),
    reportError: (event) => calls.push(`report:${event}`),
  };
  return { calls, dependencies };
}

test('every operator action authorizes before resolving the company and calls one mutation', async () => {
  for (const kind of kinds) {
    const context = setup();
    const result = await runAdminCompanyOnboardingAction(
      {
        kind,
        companyId,
        previousState: createAdminOnboardingActionState(7, () => operationId),
        formData: validForm(kind),
      },
      context.dependencies,
    );
    assert.equal(result.status, 'saved', kind);
    assert.deepEqual(context.calls.slice(0, 4), [
      'auth',
      `resolve:${companyId}`,
      `read:${actorId}:${tenantId}:${companyId}`,
      `mutate:${kind}:${actorId}:${tenantId}:${companyId}:${operationId}:7`,
    ]);
    assert.equal(context.calls.filter((call) => call.startsWith('mutate:')).length, 1);
  }
});

test('wrong role or status cannot trigger service-role resolution', async () => {
  const context = setup();
  context.dependencies.authorize = async () => {
    context.calls.push('auth');
    throw new Error('DENIED');
  };
  await assert.rejects(
    () =>
      runAdminCompanyOnboardingAction(
        {
          kind: 'activate',
          companyId,
          previousState: createAdminOnboardingActionState(7, () => operationId),
          formData: validForm('activate'),
        },
        context.dependencies,
      ),
    /DENIED/,
  );
  assert.deepEqual(context.calls, ['auth']);
});

test('unknown or mismatched company/tenant scope fails closed', async () => {
  for (const mode of ['missing', 'mismatch'] as const) {
    const context = setup();
    if (mode === 'missing') context.dependencies.resolveCompany = async () => null;
    else {
      context.dependencies.read = async () => ({
        companyId,
        tenantId: operationId,
        companyName: 'Acme Trading LLC',
        onboardingVersion: 7,
      });
    }
    const result = await runAdminCompanyOnboardingAction(
      {
        kind: 'legal',
        companyId,
        previousState: createAdminOnboardingActionState(7, () => operationId),
        formData: validForm('legal'),
      },
      context.dependencies,
    );
    assert.equal(result.status === 'error' ? result.code : '', 'COMPANY_NOT_FOUND');
    assert.equal(
      context.calls.some((call) => call.startsWith('mutate:')),
      false,
    );
  }
});

test('invalid section data returns sanitized field codes only', async () => {
  const context = setup();
  const data = validForm('establishment');
  data.set('establishmentCardNumber', 'SECRET-EST-1234');
  data.set('establishmentCardExpiry', 'not-a-date');
  const result = await runAdminCompanyOnboardingAction(
    {
      kind: 'establishment',
      companyId,
      previousState: createAdminOnboardingActionState(7, () => operationId),
      formData: data,
    },
    context.dependencies,
  );
  assert.deepEqual(result, {
    status: 'error',
    version: 7,
    operationId: nextOperationId,
    code: 'INVALID_SECTION_INPUT',
    fieldErrors: { establishmentCardExpiry: 'invalid' },
  });
  assert.equal(JSON.stringify(result).includes('SECRET-EST-1234'), false);
  assert.equal(
    context.calls.some((call) => call.startsWith('mutate:')),
    false,
  );
});

test('stale versions and operation reuse remain public, sanitized, and side-effect free', async () => {
  for (const [code, expected] of [
    ['conflict', 'STALE_ONBOARDING_VERSION'],
    ['operationConflict', 'OPERATION_REUSED'],
  ] as const) {
    const context = setup({ ok: false, code });
    const result = await runAdminCompanyOnboardingAction(
      {
        kind: 'bank',
        companyId,
        previousState: createAdminOnboardingActionState(7, () => operationId),
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

test('blocked activation exposes only authorized readiness codes', async () => {
  const context = setup({
    ok: true,
    companyId,
    onboardingVersion: 7,
    activated: false,
    requirements: [
      { code: 'ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING', section: 'assignment', state: 'blocked' },
    ],
  });
  const result = await runAdminCompanyOnboardingAction(
    {
      kind: 'activate',
      companyId,
      previousState: createAdminOnboardingActionState(7, () => operationId),
      formData: validForm('activate'),
    },
    context.dependencies,
  );
  assert.deepEqual(result, {
    status: 'error',
    version: 7,
    operationId: nextOperationId,
    code: 'COMPANY_NOT_READY',
    requirements: ['ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING'],
  });
});

test('successful operator mutations revalidate exact routes before final redirects', async () => {
  for (const kind of kinds) {
    const context = setup();
    await runAdminCompanyOnboardingAction(
      {
        kind,
        companyId,
        previousState: createAdminOnboardingActionState(7, () => operationId),
        formData: validForm(kind),
      },
      context.dependencies,
    );
    const tail = context.calls.slice(4);
    assert.deepEqual(tail.slice(0, 3), [
      `revalidate:/admin/companies/${companyId}/onboarding`,
      `revalidate:/admin/companies/${companyId}`,
      'revalidate:/admin/companies',
    ]);
    assert.deepEqual(
      tail.slice(3),
      kind === 'submit' || kind === 'activate' ? [`redirect:/admin/companies/${companyId}`] : [],
    );
  }
});

test('operator Save and Continue advances to the next fixed route without query state', async () => {
  const context = setup();
  const data = validForm('office');
  data.set('intent', 'continue');
  await runAdminCompanyOnboardingAction(
    {
      kind: 'office',
      companyId,
      previousState: createAdminOnboardingActionState(7, () => operationId),
      formData: data,
    },
    context.dependencies,
  );
  assert.deepEqual(
    context.calls.filter((call) => call.startsWith('redirect:')),
    [`redirect:/admin/companies/${companyId}/onboarding/establishment`],
  );
});
