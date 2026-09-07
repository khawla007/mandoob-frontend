import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPLICATION_DEFINITION,
  EMPTY_APPLICATION_DRAFT,
  validateApplication,
  validateApplicationStep,
  prepareApplicationCompletion,
  type ApplicationDraft,
} from './index';

const validDraft: ApplicationDraft = {
  ...EMPTY_APPLICATION_DRAFT,
  contact: {
    fullName: 'Example Person',
    nationality: 'AE',
    email: 'person@example.test',
    phone: '',
  },
  business: {
    activityId: 'professional-services',
    preferredNames: ['Example One', '', ''],
    summary: 'A sufficiently detailed business activity summary.',
  },
  setup: {
    jurisdiction: 'free_zone',
    authorityId: 'dmcc',
    legalStructureId: 'fz_llc',
    officeTypeId: 'flexi',
    officeNotes: '',
    addOnIds: [],
  },
  visas: {
    required: true,
    investorCount: '1',
    employeeCount: '1',
    familyCount: '0',
    estimatorTotalSuggestion: 2,
  },
  shareholders: [
    {
      id: 'shareholder-1',
      kind: 'individual',
      fullName: 'Example Person',
      nationality: 'AE',
      ownershipBasisPoints: '6000',
    },
    {
      id: 'shareholder-2',
      kind: 'individual',
      fullName: 'Example Two',
      nationality: 'GB',
      ownershipBasisPoints: '4000',
    },
  ],
  confirmations: { informationIsTrue: true, dataProcessingConsent: true },
};

test('whole-form errors follow definition step and control order', () => {
  const result = validateApplication(EMPTY_APPLICATION_DRAFT, APPLICATION_DEFINITION);
  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.deepEqual(
    result.errors.slice(0, 4).map((error) => error.fieldId),
    [
      'application-full-name',
      'application-nationality',
      'application-contact-channel',
      'application-activity',
    ],
  );
  assert.equal(result.firstInvalidControlId, 'application-full-name');
  assert.equal(result.steps.contact, 'invalid');
  assert.equal(result.steps.review, 'invalid');
});

test('step validation is scoped and valid application passes', () => {
  const contact = validateApplicationStep(
    EMPTY_APPLICATION_DRAFT,
    'contact',
    APPLICATION_DEFINITION,
  );
  assert.ok(contact.errors.every((error) => error.stepId === 'contact'));
  assert.deepEqual(contact.steps, {
    contact: 'invalid',
    business: 'incomplete',
    setup: 'incomplete',
    ownership: 'incomplete',
    review: 'incomplete',
  });
  const setup = validateApplicationStep(validDraft, 'setup', APPLICATION_DEFINITION);
  assert.deepEqual(setup.steps, {
    contact: 'complete',
    business: 'complete',
    setup: 'complete',
    ownership: 'incomplete',
    review: 'incomplete',
  });
  assert.deepEqual(validateApplication(validDraft, APPLICATION_DEFINITION), {
    status: 'valid',
    errors: [],
    firstInvalidControlId: null,
    steps: {
      contact: 'complete',
      business: 'complete',
      setup: 'complete',
      ownership: 'complete',
      review: 'complete',
    },
  });
});

test('each supplied contact channel is valid and errors retain per-control order', () => {
  const badEmail = validateApplication(
    {
      ...validDraft,
      contact: { ...validDraft.contact, email: 'not-an-email', phone: '+971501234567' },
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(badEmail.status, 'invalid');
  if (badEmail.status === 'invalid') {
    assert.equal(badEmail.errors[0].fieldId, 'application-email');
    assert.equal(badEmail.firstInvalidControlId, 'application-email');
  }

  const badBoth = validateApplication(
    {
      ...validDraft,
      contact: { ...validDraft.contact, email: 'bad', phone: 'bad' },
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(badBoth.status, 'invalid');
  if (badBoth.status === 'invalid') {
    assert.deepEqual(
      badBoth.errors.slice(0, 2).map((error) => error.fieldId),
      ['application-email', 'application-phone'],
    );
  }
});

test('phone validation requires a sensible normalized digit count', () => {
  for (const phone of ['       ', '() -- ()', '+( ) -  ', '+1 (23) 45']) {
    const result = validateApplication(
      {
        ...validDraft,
        contact: { ...validDraft.contact, email: '', phone },
      },
      APPLICATION_DEFINITION,
    );
    assert.equal(result.status, 'invalid', JSON.stringify(phone));
  }

  assert.equal(
    validateApplication(
      {
        ...validDraft,
        contact: { ...validDraft.contact, email: '', phone: '+971 (50) 123-4567' },
      },
      APPLICATION_DEFINITION,
    ).status,
    'valid',
  );
});

test('completion counts only document-readiness keys allowed for current owners', () => {
  const prepared = prepareApplicationCompletion(
    {
      ...validDraft,
      documentReadiness: {
        'passport-copy:contact': 'ready',
        'activity-summary:business': 'ready',
        'passport-copy:shareholder-1': 'ready',
        'passport-copy:shareholder-999': 'ready',
        'unknown-document:contact': 'ready',
      },
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(prepared.status, 'ready');
  if (prepared.status === 'ready') assert.equal(prepared.value.readyDocumentCount, 3);
});

test('shareholder ownership uses integer basis points and must total exactly 100 percent', () => {
  for (const ownershipBasisPoints of ['', '40.00', '4000.5', '-1', '10001']) {
    const result = validateApplication(
      {
        ...validDraft,
        shareholders: [
          validDraft.shareholders[0],
          { ...validDraft.shareholders[1], ownershipBasisPoints },
        ],
      },
      APPLICATION_DEFINITION,
    );
    assert.equal(result.status, 'invalid', ownershipBasisPoints);
  }

  const badTotal = validateApplication(
    {
      ...validDraft,
      shareholders: validDraft.shareholders.map((row) => ({
        ...row,
        ownershipBasisPoints: '4000',
      })),
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(badTotal.status, 'invalid');
  if (badTotal.status === 'invalid') {
    assert.ok(badTotal.errors.some((error) => error.fieldId === 'application-ownership-total'));
  }
});

test('shareholder names and nationalities use the definition name boundaries', () => {
  const boundedDefinition = {
    ...APPLICATION_DEFINITION,
    limits: { ...APPLICATION_DEFINITION.limits, nameMin: 3, nameMax: 5 },
  } as never;
  const cases = [
    {
      field: 'fullName' as const,
      value: 'ab',
      fieldId: 'application-shareholder-1-full-name',
      message: 'Shareholder full name must be 3 to 5 characters.',
    },
    {
      field: 'fullName' as const,
      value: 'abcdef',
      fieldId: 'application-shareholder-1-full-name',
      message: 'Shareholder full name must be 3 to 5 characters.',
    },
    {
      field: 'nationality' as const,
      value: 'ab',
      fieldId: 'application-shareholder-1-nationality',
      message: 'Shareholder nationality must be 3 to 5 characters.',
    },
    {
      field: 'nationality' as const,
      value: 'abcdef',
      fieldId: 'application-shareholder-1-nationality',
      message: 'Shareholder nationality must be 3 to 5 characters.',
    },
  ];

  for (const item of cases) {
    const result = validateApplication(
      {
        ...validDraft,
        shareholders: validDraft.shareholders.map((row, index) => ({
          ...row,
          fullName: 'Owner',
          nationality: 'Emiri',
          ...(index === 0 ? { [item.field]: item.value } : {}),
        })),
      },
      boundedDefinition,
    );
    assert.equal(result.status, 'invalid');
    if (result.status === 'invalid') {
      const error = result.errors.find(({ fieldId }) => fieldId === item.fieldId);
      assert.equal(error?.message, item.message);
      assert.equal(error?.code, 'invalid');
    }
  }

  const boundaries = validateApplication(
    {
      ...validDraft,
      shareholders: validDraft.shareholders.map((row, index) => ({
        ...row,
        fullName: index === 0 ? 'Abc' : 'Owner',
        nationality: index === 0 ? 'UAE' : 'Emiri',
      })),
    },
    boundedDefinition,
  );
  if (boundaries.status === 'invalid') {
    assert.ok(
      boundaries.errors.every(
        ({ fieldId }) =>
          !fieldId.startsWith('application-shareholder-') ||
          (!fieldId.endsWith('-full-name') && !fieldId.endsWith('-nationality')),
      ),
    );
  }
});

test('visa suggestion is not treated as an allocated category count', () => {
  const result = validateApplication(
    {
      ...validDraft,
      visas: {
        required: true,
        investorCount: '',
        employeeCount: '',
        familyCount: '',
        estimatorTotalSuggestion: 2,
      },
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') {
    assert.ok(result.errors.some((error) => error.fieldId === 'application-investor-visas'));
  }
});
