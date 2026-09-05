import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateCatalogEstimate,
  getPublicEstimatorSource,
  validateEstimatorCatalog,
} from './public-catalog';
import { DEMO_ESTIMATOR_CATALOG } from './public-demo-catalog';
import type { EstimatorDraft } from './public-contracts';

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

test('public estimator source exposes a validated demo catalog only outside production', () => {
  const development = getPublicEstimatorSource('development');
  assert.equal(development.status, 'indicative-demo');
  assert.equal(development.catalog.currency, 'AED');
  assert.ok(development.catalog.version.length > 0);

  const production = getPublicEstimatorSource('production');
  assert.deepEqual(production, {
    status: 'unavailable',
    retryable: false,
    reason: 'approved-catalog-required',
  });
});

test('development evidence states are explicit and ignored by production', () => {
  assert.deepEqual(getPublicEstimatorSource('development', 'unavailable'), {
    status: 'unavailable',
    retryable: false,
    reason: 'approved-catalog-required',
  });
  assert.deepEqual(getPublicEstimatorSource('development', 'error'), {
    status: 'error',
    retryable: false,
    reason: 'invalid-source',
  });
  const noMatch = getPublicEstimatorSource('development', 'no-match');
  assert.equal(noMatch.status, 'indicative-demo');
  if (noMatch.status === 'indicative-demo') assert.equal(noMatch.catalog.fees.length, 0);
  assert.equal(getPublicEstimatorSource('production', 'no-match').status, 'unavailable');
});

test('catalog boundary rejects empty, malformed, duplicate, and unsafe-money sources', () => {
  assert.equal(validateEstimatorCatalog({}).success, false);
  assert.equal(
    validateEstimatorCatalog({ ...DEMO_ESTIMATOR_CATALOG, authorities: [] }).success,
    false,
  );
  assert.equal(
    validateEstimatorCatalog({
      ...DEMO_ESTIMATOR_CATALOG,
      activities: [DEMO_ESTIMATOR_CATALOG.activities[0], DEMO_ESTIMATOR_CATALOG.activities[0]],
    }).success,
    false,
  );
  assert.equal(
    validateEstimatorCatalog({
      ...DEMO_ESTIMATOR_CATALOG,
      fees: [{ ...DEMO_ESTIMATOR_CATALOG.fees[0], amountMinor: 1.5 }],
    }).success,
    false,
  );
});

test('one catalog/version owns options, calculation, line items, totals, and source context', () => {
  const result = calculateCatalogEstimate(
    DEMO_ESTIMATOR_CATALOG,
    completeDraft,
    new Date('2026-09-05T08:00:00.000Z'),
  );

  assert.equal(result.catalogVersion, DEMO_ESTIMATOR_CATALOG.version);
  assert.equal(result.sourceState, 'indicative-demo');
  assert.equal(result.currency, 'AED');
  assert.ok(result.oneTimeTotalMinor > 0);
  assert.ok(result.annualTotalMinor > 0);
  assert.ok(result.lineItems.every((item) => Number.isSafeInteger(item.amountMinor)));
  assert.ok(
    result.lineItems.every(
      (item) => item.totalMinor === item.amountMinor * item.quantity && item.sourceContext,
    ),
  );
  assert.ok(result.assumptions.length > 0);
  assert.ok(result.inclusions.length > 0);
  assert.ok(result.exclusions.length > 0);
  assert.equal(result.generatedAt, '2026-09-05T08:00:00.000Z');
});

test('catalog calculation distinguishes unsupported and no-matching-data states', () => {
  assert.throws(
    () => calculateCatalogEstimate(DEMO_ESTIMATOR_CATALOG, { ...completeDraft, visaCount: '99' }),
    (error: unknown) =>
      error instanceof Error && error.name === 'UnsupportedEstimatorCombinationError',
  );

  const noFees = { ...DEMO_ESTIMATOR_CATALOG, fees: [] };
  assert.throws(
    () => calculateCatalogEstimate(noFees, completeDraft),
    (error: unknown) => error instanceof Error && error.name === 'NoMatchingEstimatorDataError',
  );
});

test('every selectable priced option can be consumed by the calculator', () => {
  for (const authority of DEMO_ESTIMATOR_CATALOG.authorities) {
    for (const officeTypeId of authority.officeTypeIds.filter((id) => id !== 'none')) {
      assert.ok(
        DEMO_ESTIMATOR_CATALOG.fees.some(
          (fee) =>
            fee.authorityId === authority.id &&
            fee.quantityBasis === 'office' &&
            fee.optionId === officeTypeId,
        ),
        `${authority.id}/${officeTypeId} must have a matching office fee`,
      );
    }

    for (const addOnId of authority.addOnIds) {
      assert.ok(
        DEMO_ESTIMATOR_CATALOG.fees.some(
          (fee) =>
            fee.authorityId === authority.id &&
            fee.quantityBasis === 'add_on' &&
            fee.optionId === addOnId,
        ),
        `${authority.id}/${addOnId} must have a matching add-on fee`,
      );
    }
  }
});
