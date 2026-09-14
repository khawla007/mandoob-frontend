import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_ESTIMATOR_CATALOG } from './public-demo-catalog';
import {
  EMPTY_ESTIMATOR_DRAFT,
  applyDraftChange,
  buildEstimatorApplyHref,
  getEstimatorResumeStep,
  parseEstimatorPrefill,
  validateEstimatorDraft,
} from './public-draft';
import type { EstimatorDraft, EstimatorResult } from './public-contracts';

const completeDraft: EstimatorDraft = {
  jurisdiction: 'free_zone',
  authorityId: 'dmcc',
  activityId: 'professional-services',
  legalStructureId: 'fz_llc',
  shareholderCount: '2',
  visaCount: '1',
  officeTypeId: 'flexi',
  addOnIds: ['bank-account-assistance'],
};

test('empty draft starts at Step 1 without manufacturing defaults', () => {
  assert.deepEqual(EMPTY_ESTIMATOR_DRAFT, {
    jurisdiction: null,
    authorityId: null,
    activityId: null,
    legalStructureId: null,
    shareholderCount: '',
    visaCount: '',
    officeTypeId: null,
    addOnIds: [],
  });
});

test('authority selection preserves unanswered numeric fields', () => {
  const selected = applyDraftChange(
    { ...EMPTY_ESTIMATOR_DRAFT, jurisdiction: 'free_zone' },
    'authorityId',
    'dmcc',
    DEMO_ESTIMATOR_CATALOG,
  );

  assert.equal(selected.shareholderCount, '');
  assert.equal(selected.visaCount, '');
});

test('resume targets the first incomplete step or review for a complete draft', () => {
  assert.equal(getEstimatorResumeStep(completeDraft, DEMO_ESTIMATOR_CATALOG), 9);
  assert.equal(
    getEstimatorResumeStep({ ...completeDraft, legalStructureId: null }, DEMO_ESTIMATOR_CATALOG),
    4,
  );
});

test('upstream edits deterministically clear incompatible downstream choices', () => {
  const changed = applyDraftChange(
    completeDraft,
    'jurisdiction',
    'offshore',
    DEMO_ESTIMATOR_CATALOG,
  );
  assert.deepEqual(changed, {
    jurisdiction: 'offshore',
    authorityId: null,
    activityId: null,
    legalStructureId: null,
    shareholderCount: '2',
    visaCount: '0',
    officeTypeId: null,
    addOnIds: [],
  });

  const authorityChanged = applyDraftChange(
    completeDraft,
    'authorityId',
    'dubai-mainland',
    DEMO_ESTIMATOR_CATALOG,
  );
  assert.equal(authorityChanged.authorityId, null, 'a mismatched authority is never substituted');
  assert.equal(authorityChanged.activityId, null);
  assert.equal(authorityChanged.legalStructureId, null);
  assert.equal(authorityChanged.officeTypeId, null);
});

test('draft validation covers step order, integer bounds, and accessible error targets', () => {
  const empty = validateEstimatorDraft(EMPTY_ESTIMATOR_DRAFT, DEMO_ESTIMATOR_CATALOG);
  assert.equal(empty.valid, false);
  assert.deepEqual(empty.errors[0], {
    step: 1,
    fieldId: 'estimate-jurisdiction',
    message: 'Choose a jurisdiction.',
  });

  for (const shareholderCount of ['', '1.5', 'abc', '-1', '0', '999']) {
    const validation = validateEstimatorDraft(
      { ...completeDraft, shareholderCount },
      DEMO_ESTIMATOR_CATALOG,
    );
    assert.equal(validation.valid, false, shareholderCount);
    assert.equal(
      validation.errors.some((error) => error.fieldId === 'estimate-shareholders'),
      true,
    );
  }

  for (const visaCount of ['', '0.5', 'abc', '-1', '999']) {
    const validation = validateEstimatorDraft(
      { ...completeDraft, visaCount },
      DEMO_ESTIMATOR_CATALOG,
    );
    assert.equal(validation.valid, false, visaCount);
    assert.equal(
      validation.errors.some((error) => error.fieldId === 'estimate-visas'),
      true,
    );
  }

  assert.equal(validateEstimatorDraft(completeDraft, DEMO_ESTIMATOR_CATALOG).valid, true);
});

test('URL prefill accepts only single allowlisted catalog IDs and repairs legacy vehicle values', () => {
  assert.deepEqual(
    parseEstimatorPrefill(
      { jurisdiction: 'free_zone', authority: 'DMCC', emirate: 'dubai' },
      DEMO_ESTIMATOR_CATALOG,
    ),
    { jurisdiction: 'free_zone', authorityId: 'dmcc' },
  );
  assert.deepEqual(parseEstimatorPrefill({ vehicle: 'free-zone' }, DEMO_ESTIMATOR_CATALOG), {
    jurisdiction: 'free_zone',
  });
  assert.deepEqual(
    parseEstimatorPrefill(
      {
        jurisdiction: ['free_zone', 'mainland'],
        authority: '<script>alert(1)</script>',
        emirate: 'x'.repeat(100),
        unknown: 'ignored',
      },
      DEMO_ESTIMATOR_CATALOG,
    ),
    {},
  );
});

test('application handoff contains only reviewed non-sensitive context', () => {
  const result = {
    reference: 'EST-DEMO123456',
    normalizedDraft: completeDraft,
  } as EstimatorResult;
  const href = buildEstimatorApplyHref(result);
  const url = new URL(href, 'https://mandoob.test');

  assert.equal(url.pathname, '/apply');
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'activity',
    'addons',
    'authority',
    'estimate_ref',
    'jurisdiction',
    'legal_structure',
    'office_type',
    'shareholders',
    'visas',
  ]);
  assert.equal(url.searchParams.get('authority'), 'dmcc');
  assert.equal(url.searchParams.get('estimate_ref'), 'EST-DEMO123456');
});
