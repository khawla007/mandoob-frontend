import assert from 'node:assert/strict';
import test from 'node:test';
import {
  P308_RENEWAL_COST_INTERFACE_VERSION,
  parseP308RenewalCostFact,
} from './p3-08-renewal-cost-adapter';

const valid = {
  interfaceVersion: 1,
  renewalId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
  renewalVersion: 7,
  governmentFeeMinor: 100_000,
  proServiceFeeMinor: 25_000,
  fineMinor: 5_000,
  currency: 'AED',
} as const;

test('accepts the frozen P3.08 v1 renewal cost fact and derives an exact minor-unit total', () => {
  assert.equal(P308_RENEWAL_COST_INTERFACE_VERSION, 1);
  assert.deepEqual(parseP308RenewalCostFact(valid), { ...valid, totalMinor: 130_000 });
});

test('fails closed for unsupported versions and unknown fields', () => {
  assert.throws(
    () => parseP308RenewalCostFact({ ...valid, interfaceVersion: 2 }),
    /RENEWAL_COST_INTERFACE_UNSUPPORTED/u,
  );
  assert.throws(() => parseP308RenewalCostFact({ ...valid, stage: 'completed' }));
});

test('rejects invalid ownership references, versions, currencies, and amounts', () => {
  for (const patch of [
    { tenantId: 'not-a-uuid' },
    { renewalVersion: 0 },
    { currency: 'aed' },
    { currency: 'ZZZ' },
    { governmentFeeMinor: -1 },
    { proServiceFeeMinor: 100_000_000_001 },
    { fineMinor: 0.5 },
  ]) {
    assert.throws(() => parseP308RenewalCostFact({ ...valid, ...patch }));
  }
});

test('returns a new reference-only projection without mutating the producer fact', () => {
  const input = { ...valid };
  const projection = parseP308RenewalCostFact(input);

  assert.notEqual(projection, input);
  assert.deepEqual(input, valid);
  assert.deepEqual(Object.keys(projection).sort(), [
    'companyId',
    'currency',
    'fineMinor',
    'governmentFeeMinor',
    'interfaceVersion',
    'proServiceFeeMinor',
    'renewalId',
    'renewalVersion',
    'tenantId',
    'totalMinor',
  ]);
});
