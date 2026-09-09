import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeMfaEnrollment } from './mfa-enrollment';

test('fresh enrollment removes prior unverified TOTP factors before allowing mutation', async () => {
  const removed: string[] = [];
  const result = await authorizeMfaEnrollment({
    listFactors: async () => [
      { id: 'old-totp', status: 'unverified', type: 'totp' },
      { id: 'phone', status: 'unverified', type: 'phone' },
    ],
    loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal1' }),
    removeFactor: async (factorId) => {
      removed.push(factorId);
    },
  });
  assert.equal(result, 'allowed');
  assert.deepEqual(removed, ['old-totp']);
});

test('verified factors require AAL2 and cannot be re-enrolled after challenge', async () => {
  for (const [currentLevel, expected] of [
    ['aal1', 'challenge_required'],
    ['aal2', 'already_enrolled'],
  ] as const) {
    let removals = 0;
    const result = await authorizeMfaEnrollment({
      listFactors: async () => [{ id: 'verified', status: 'verified', type: 'totp' }],
      loadAssurance: async () => ({ currentLevel, nextLevel: 'aal2' }),
      removeFactor: async () => {
        removals += 1;
      },
    });
    assert.equal(result, expected);
    assert.equal(removals, 0);
  }
});

test('assurance indicating an existing factor blocks enrollment when the factor list is stale', async () => {
  const result = await authorizeMfaEnrollment({
    listFactors: async () => [],
    loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal2' }),
    removeFactor: async () => undefined,
  });
  assert.equal(result, 'challenge_required');
});

test('factor, assurance, and cleanup uncertainty all fail closed', async () => {
  const base = {
    listFactors: async () => [{ id: 'old', status: 'unverified', type: 'totp' }],
    loadAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal1' }),
    removeFactor: async () => undefined,
  };
  for (const dependencies of [
    { ...base, listFactors: async () => Promise.reject(new Error('factor lookup')) },
    { ...base, loadAssurance: async () => Promise.reject(new Error('assurance lookup')) },
    { ...base, loadAssurance: async () => ({ currentLevel: null, nextLevel: null }) },
    { ...base, removeFactor: async () => Promise.reject(new Error('cleanup')) },
  ]) {
    assert.equal(await authorizeMfaEnrollment(dependencies), 'failed');
  }
});
