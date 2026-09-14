import assert from 'node:assert/strict';
import test from 'node:test';

import { buildP112StateOwnershipLedger } from './state-ledger';

test('renders one truthful, exact proof owner for every frozen state', () => {
  const ledger = buildP112StateOwnershipLedger('2026-09-14T00:00:00.000Z');
  assert.equal(ledger.states.length, 146);
  assert.equal(new Set(ledger.states.map(({ stateId }) => stateId)).size, 146);
  assert.deepEqual(ledger.summary, {
    total: 146,
    tierARoute: 44,
    tierCBrowser: 14,
    sourceRegression: 88,
  });
  assert.ok(
    ledger.states.every(
      ({ stateId, condition, proof }) =>
        /^S\d{3}$/u.test(stateId) && condition.length > 0 && proof.includes('.ts#'),
    ),
  );
});
