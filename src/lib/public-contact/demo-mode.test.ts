import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveContactDemoMode } from './demo-mode';

describe('development-only contact browser evidence mode', () => {
  it('resolves every no-write presentation outcome with a fixed pending delay', () => {
    for (const outcome of [
      'success',
      'duplicate',
      'rate_limited',
      'failure',
      'unavailable',
    ] as const) {
      assert.deepEqual(resolveContactDemoMode(outcome, 'development'), {
        outcome,
        delayMs: 900,
      });
    }
  });

  it('is unavailable in production and rejects ambiguous or unknown values', () => {
    assert.equal(resolveContactDemoMode('success', 'production'), undefined);
    assert.equal(resolveContactDemoMode('success', 'test'), undefined);
    assert.equal(resolveContactDemoMode(['success'], 'development'), undefined);
    assert.equal(resolveContactDemoMode('sent', 'development'), undefined);
    assert.equal(resolveContactDemoMode(undefined, 'development'), undefined);
  });
});
