import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_ESTIMATOR_CATALOG } from './public-demo-catalog';
import {
  ESTIMATOR_DRAFT_RETENTION_MS,
  ESTIMATOR_DRAFT_SCHEMA_VERSION,
  parseSavedEstimatorDraft,
  serializeEstimatorDraft,
} from './public-storage';
import type { EstimatorDraft } from './public-contracts';

const draft: EstimatorDraft = {
  jurisdiction: 'free_zone',
  authorityId: 'dmcc',
  activityId: 'professional-services',
  legalStructureId: 'fz_llc',
  shareholderCount: '2',
  visaCount: '1',
  officeTypeId: 'flexi',
  addOnIds: ['bank-account-assistance'],
};
const now = new Date('2026-09-05T08:00:00.000Z');

test('saved estimator draft is versioned, catalog-bound, selection-only, and restorable', () => {
  const raw = serializeEstimatorDraft(draft, DEMO_ESTIMATOR_CATALOG.version, now);
  const payload = JSON.parse(raw);
  assert.deepEqual(Object.keys(payload).sort(), [
    'catalogVersion',
    'draft',
    'savedAt',
    'schemaVersion',
  ]);
  assert.equal(payload.schemaVersion, ESTIMATOR_DRAFT_SCHEMA_VERSION);
  assert.equal(raw.includes('email'), false);
  assert.equal(raw.includes('phone'), false);
  assert.deepEqual(parseSavedEstimatorDraft(raw, DEMO_ESTIMATOR_CATALOG, now), {
    status: 'ready',
    draft,
    savedAt: now.toISOString(),
  });
});

test('saved estimator draft rejects expiry, corruption, schema mismatch, and catalog mismatch', () => {
  const raw = serializeEstimatorDraft(draft, DEMO_ESTIMATOR_CATALOG.version, now);
  assert.equal(parseSavedEstimatorDraft('{broken', DEMO_ESTIMATOR_CATALOG, now).status, 'corrupt');

  const expiredAt = new Date(now.getTime() + ESTIMATOR_DRAFT_RETENTION_MS + 1);
  assert.equal(parseSavedEstimatorDraft(raw, DEMO_ESTIMATOR_CATALOG, expiredAt).status, 'expired');

  const schemaMismatch = JSON.stringify({ ...JSON.parse(raw), schemaVersion: 999 });
  assert.equal(
    parseSavedEstimatorDraft(schemaMismatch, DEMO_ESTIMATOR_CATALOG, now).status,
    'incompatible',
  );

  const catalogMismatch = JSON.stringify({ ...JSON.parse(raw), catalogVersion: 'other' });
  assert.equal(
    parseSavedEstimatorDraft(catalogMismatch, DEMO_ESTIMATOR_CATALOG, now).status,
    'incompatible',
  );
});

test('saved payload is revalidated against current compatibility rules', () => {
  const raw = serializeEstimatorDraft(
    { ...draft, authorityId: 'unknown-authority' },
    DEMO_ESTIMATOR_CATALOG.version,
    now,
  );
  assert.equal(parseSavedEstimatorDraft(raw, DEMO_ESTIMATOR_CATALOG, now).status, 'corrupt');
});
