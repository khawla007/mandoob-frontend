import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDelta,
  calculatePercentage,
  deriveAssignmentCounts,
  orderLeadStageCounts,
  resolveProHealth,
} from './aggregates';

test('percentage and delta preserve real zero without inventing infinity', () => {
  assert.equal(calculatePercentage(0, 0), 0);
  assert.equal(calculatePercentage(2, 4), 50);
  assert.deepEqual(calculateDelta(0, 0), { kind: 'unavailable' });
  assert.deepEqual(calculateDelta(5, 0), { kind: 'unavailable' });
  assert.deepEqual(calculateDelta(8, 10), { kind: 'data', percentage: -20 });
});

test('lead stages retain the accepted deterministic order and zero stages', () => {
  assert.deepEqual(orderLeadStageCounts({ won: 2, new: 4 }), [
    { stage: 'new', count: 4, percentage: 66.7 },
    { stage: 'contacted', count: 0, percentage: 0 },
    { stage: 'qualified', count: 0, percentage: 0 },
    { stage: 'won', count: 2, percentage: 33.3 },
    { stage: 'lost', count: 0, percentage: 0 },
  ]);
});

test('assignment counts enforce the one-company invariant', () => {
  assert.deepEqual(deriveAssignmentCounts({ activePros: 7, companies: 8, activeAssignments: 5 }), {
    unassignedPros: 2,
    unassignedCompanies: 3,
  });
  assert.throws(
    () => deriveAssignmentCounts({ activePros: 1, companies: 2, activeAssignments: 3 }),
    /assignment invariant/i,
  );
});

test('PRO health is a transparent assignment label, never a score', () => {
  assert.deepEqual(resolveProHealth(null), { state: 'unassigned', companyName: null });
  assert.deepEqual(resolveProHealth({ companyName: 'Company One' }), {
    state: 'assigned',
    companyName: 'Company One',
  });
});
