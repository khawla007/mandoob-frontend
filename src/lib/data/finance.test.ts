import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateFinanceKpis, monthlyAmountMinor } from './finance';

test('monthlyAmountMinor normalizes annual subscriptions to monthly MRR', () => {
  assert.equal(monthlyAmountMinor(9900, 'month'), 9900);
  assert.equal(monthlyAmountMinor(1_188_00, 'year'), 9900);
});

test('calculateFinanceKpis computes MRR, ARR, active tenants, and churn', () => {
  const kpis = calculateFinanceKpis({
    activeSubscriptions: [
      { unit_amount_minor: 4900, interval: 'month' },
      { unit_amount_minor: 1_188_00, interval: 'year' },
    ],
    canceledLast30: 1,
    activeAtStart: 20,
  });

  assert.equal(kpis.mrrMinor, 14800);
  assert.equal(kpis.arrMinor, 177600);
  assert.equal(kpis.activeTenantCount, 2);
  assert.equal(kpis.churnRate, 5);
});

