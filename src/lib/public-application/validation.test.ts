import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPLICATION_DEFINITION,
  EMPTY_APPLICATION_DRAFT,
  validateApplication,
  validateApplicationStep,
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
