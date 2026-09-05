import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_ESTIMATOR_CATALOG } from '@/lib/estimator/public-demo-catalog';
import {
  APPLICATION_DEFINITION,
  APPLICATION_DEFINITION_VERSION,
  EMPTY_APPLICATION_DRAFT,
  getApplicationDefinitionSource,
} from './index';

test('the reviewed application definition has stable stages and ordered setup substeps', () => {
  assert.equal(APPLICATION_DEFINITION.version, APPLICATION_DEFINITION_VERSION);
  assert.deepEqual(
    APPLICATION_DEFINITION.steps.map((step) => step.id),
    ['contact', 'business', 'setup', 'ownership', 'review'],
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.setupSubsteps.map((step) => step.id),
    ['jurisdiction', 'authority', 'visas', 'office', 'services'],
  );
  assert.deepEqual(APPLICATION_DEFINITION.legalLinks, {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  });
  assert.deepEqual(APPLICATION_DEFINITION.conditions, [
    { fieldId: 'visa-counts', when: 'visas-required' },
    { fieldId: 'office-notes', when: 'office-selected' },
  ]);
  assert.deepEqual(
    APPLICATION_DEFINITION.documentRules.map((rule) => rule.id),
    ['contact-passport', 'business-plan', 'shareholder-passport'],
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.fields.slice(0, 6).map((field) => field.id),
    [
      'application-full-name',
      'application-nationality',
      'application-email',
      'application-phone',
      'application-contact-channel',
      'application-activity',
    ],
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.reviewSections.map((section) => section.id),
    ['personal', 'business', 'setup', 'services', 'ownership'],
  );
  assert.equal(APPLICATION_DEFINITION.confirmationLabels.heading, 'Application preview complete');
});

test('definition source accepts only the exact reviewed contract and fails closed', () => {
  const clone = structuredClone(APPLICATION_DEFINITION);
  assert.deepEqual(getApplicationDefinitionSource(clone), {
    status: 'ready',
    definition: clone,
  });
  assert.deepEqual(getApplicationDefinitionSource({ ...clone, version: 'unknown-version' }), {
    status: 'unavailable',
    retryable: true,
    reason: 'invalid-definition',
  });
  assert.deepEqual(getApplicationDefinitionSource({ ...clone, injected: 'unknown' }), {
    status: 'unavailable',
    retryable: true,
    reason: 'invalid-definition',
  });
});

test('definition choices use only P1.08 catalog IDs and preserve compatibility relations', () => {
  assert.deepEqual(
    APPLICATION_DEFINITION.jurisdictions.map((option) => option.id),
    DEMO_ESTIMATOR_CATALOG.jurisdictions.map((option) => option.id),
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.authorities.map((option) => option.id),
    DEMO_ESTIMATOR_CATALOG.authorities.map((option) => option.id),
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.activities.map((option) => option.id),
    DEMO_ESTIMATOR_CATALOG.activities.map((option) => option.id),
  );
  assert.deepEqual(
    APPLICATION_DEFINITION.officeTypes.map((option) => option.id),
    DEMO_ESTIMATOR_CATALOG.officeTypes.map((option) => option.id),
  );
  for (const authority of APPLICATION_DEFINITION.authorities) {
    const source = DEMO_ESTIMATOR_CATALOG.authorities.find((item) => item.id === authority.id);
    assert.ok(source);
    assert.deepEqual(authority.activityIds, source.activityIds);
    assert.deepEqual(authority.legalStructureIds, source.legalStructureIds);
    assert.deepEqual(authority.officeTypeIds, source.officeTypeIds);
  }
});

test('an empty draft has individual shareholder rows, no fabricated visa allocation, and no consent', () => {
  assert.equal(EMPTY_APPLICATION_DRAFT.shareholders.length, 1);
  assert.deepEqual(EMPTY_APPLICATION_DRAFT.shareholders[0], {
    id: 'shareholder-1',
    kind: 'individual',
    fullName: '',
    nationality: '',
    ownershipBasisPoints: '',
  });
  assert.deepEqual(EMPTY_APPLICATION_DRAFT.visas, {
    required: null,
    investorCount: '',
    employeeCount: '',
    familyCount: '',
    estimatorTotalSuggestion: null,
  });
  assert.deepEqual(EMPTY_APPLICATION_DRAFT.confirmations, {
    informationIsTrue: false,
    dataProcessingConsent: false,
  });
});
