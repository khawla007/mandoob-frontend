import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminActionIsEnabled,
  phase3UnavailableSource,
  type AdminActionContract,
  type AdminSourceState,
} from './contracts';

test('Phase 3 source gaps are explicit and cannot be mistaken for empty data', () => {
  const source = phase3UnavailableSource('document-review');

  assert.deepEqual(source, {
    state: 'unavailable',
    dependency: 'phase-3',
    contract: 'document-review',
  });
  assert.notEqual(source.state, 'empty');
});

test('unsupported mutations are unavailable contracts and never enabled', () => {
  const action: AdminActionContract = {
    state: 'unavailable',
    dependency: 'phase-3',
    explanation: 'A production write contract is required.',
  };

  assert.equal(adminActionIsEnabled(action), false);
  assert.ok(action.explanation.length > 0);
});

test('source contracts preserve real zero and isolate sanitized failures', () => {
  const zero: AdminSourceState<{ count: number }> = {
    state: 'data',
    value: { count: 0 },
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
  const failure: AdminSourceState<never> = { state: 'error', reason: 'sanitized' };

  assert.equal(zero.value.count, 0);
  assert.deepEqual(failure, { state: 'error', reason: 'sanitized' });
});
