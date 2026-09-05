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
  for (const definition of KPI_DEFINITIONS) {
    assert.equal(definition.scope, 'platform');
    assert.equal(definition.comparison, 'none');
    assert.ok(definition.source.length > 0);
    assert.ok(definition.formula.length > 0);
    assert.ok(Array.isArray(definition.filters));
  }
  assert.equal(
    KPI_DEFINITIONS.find((item) => item.id === 'activeRegistrations')?.statePolicy,
    'phase3-unavailable',
  );
  assert.deepEqual(KPI_DEFINITIONS.find((item) => item.id === 'totalLeads')?.destination, {
    kind: 'separate-action',
    href: '/admin/leads',
  });
});
