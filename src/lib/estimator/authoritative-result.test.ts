import assert from 'node:assert/strict';
import test from 'node:test';

import { seededCostDataRows } from './seed-data';
import {
  calculateAuthoritativeEstimate,
  createEstimateResultToken,
  verifyEstimateResultToken,
} from './authoritative-result';
import type { EstimateInput } from './calculate';

const input: EstimateInput = {
  jurisdiction: 'free_zone' as const,
  authority: 'IFZA',
  emirate: 'Dubai',
  activityKey: 'consulting',
  shareholderCount: 1,
  visaCount: 1,
  legalStructure: 'fz_llc' as const,
  officeType: 'flexi' as const,
  addOns: ['bank_account'],
};

const versionedRows = seededCostDataRows.map((row) => ({
  ...row,
  sourceId: '90400000-0000-4000-8000-000000000001',
  catalogVersionId: '90400000-0000-4000-8000-000000000002',
  catalogVersion: 'official-web-review-2026-09-16',
}));

test('binds an estimate to exactly one catalog source and version', () => {
  const result = calculateAuthoritativeEstimate(
    input,
    versionedRows,
    new Date('2026-09-22T00:00:00Z'),
  );
  assert.equal(result.catalogVersion, 'official-web-review-2026-09-16');
  assert.equal(result.catalogVersionId, '90400000-0000-4000-8000-000000000002');
  assert.throws(
    () =>
      calculateAuthoritativeEstimate(input, [
        ...versionedRows,
        { ...versionedRows[0], id: 'mixed', catalogVersionId: crypto.randomUUID() },
      ]),
    /single catalog version/i,
  );
});

test('signs operation-bound PDF context and rejects tampering or expiry', () => {
  const estimate = calculateAuthoritativeEstimate(
    input,
    versionedRows,
    new Date('2026-09-22T00:00:00Z'),
  );
  const token = createEstimateResultToken(
    estimate,
    'test-secret-with-at-least-32-characters',
    new Date('2026-09-22T00:00:00Z'),
  );
  const verified = verifyEstimateResultToken(
    token,
    'test-secret-with-at-least-32-characters',
    new Date('2026-09-22T00:05:00Z'),
  );
  assert.equal(verified.reference, estimate.reference);
  assert.equal(verified.catalogVersionId, estimate.catalogVersionId);
  assert.throws(
    () => verifyEstimateResultToken(`${token}x`, 'test-secret-with-at-least-32-characters'),
    /invalid/i,
  );
  assert.throws(
    () =>
      verifyEstimateResultToken(
        token,
        'test-secret-with-at-least-32-characters',
        new Date('2026-09-22T00:16:00Z'),
      ),
    /expired/i,
  );
});
