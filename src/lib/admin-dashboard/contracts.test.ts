import assert from 'node:assert/strict';
import test from 'node:test';
import { KPI_DEFINITIONS, unavailableWidget } from './contracts';

test('KPI deck preserves ten stable ordered slots and truthful unavailable contracts', () => {
  assert.deepEqual(
    KPI_DEFINITIONS.map((item) => item.id),
    [
      'totalLeads',
      'totalPros',
      'totalCompanies',
      'activeAssignments',
      'unassignedPros',
      'unassignedCompanies',
      'activeRegistrations',
      'pendingRenewals',
      'pendingPayments',
      'documentsAwaitingReview',
    ],
  );
  assert.deepEqual(unavailableWidget('phase3'), {
    state: 'unavailable',
    reason: 'phase3',
  });
});
