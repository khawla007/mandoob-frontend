import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimRecoveryContext,
  createRecoveryContextValue,
  isValidRecoveryContextValue,
  RECOVERY_CONTEXT_MAX_AGE_SECONDS,
} from './recovery-context';

const secret = 'test-service-secret-with-enough-entropy';
const issuedAt = 1_800_000_000_000;

test('recovery context is short-lived and bound to the authenticated user', () => {
  const value = createRecoveryContextValue('user-a', secret, issuedAt, 'fixednonce');
  assert.equal(isValidRecoveryContextValue(value, 'user-a', secret, issuedAt), true);
  assert.equal(isValidRecoveryContextValue(value, 'user-b', secret, issuedAt), false);
  assert.equal(
    isValidRecoveryContextValue(
      value,
      'user-a',
      secret,
      issuedAt + RECOVERY_CONTEXT_MAX_AGE_SECONDS * 1000 + 1,
    ),
    false,
  );
});

test('recovery context rejects malformed and tampered cookie values', () => {
  const value = createRecoveryContextValue('user-a', secret, issuedAt, 'fixednonce');
  assert.equal(isValidRecoveryContextValue('', 'user-a', secret, issuedAt), false);
  assert.equal(isValidRecoveryContextValue('malformed', 'user-a', secret, issuedAt), false);
  assert.equal(isValidRecoveryContextValue(`${value}x`, 'user-a', secret, issuedAt), false);
});

test('parallel recovery claims use one hashed atomic database key', async () => {
  const seen: Array<{ key: string; capacity: number; refillPerSec: number; cost?: number }> = [];
  let available = true;
  const consume = async (config: (typeof seen)[number]) => {
    seen.push(config);
    await Promise.resolve();
    if (!available) return 'limited' as const;
    available = false;
    return 'allowed' as const;
  };
  const marker = '1800000600.fixednonce.signature';
  const results = await Promise.all([
    claimRecoveryContext(marker, secret, consume),
    claimRecoveryContext(marker, secret, consume),
  ]);
  assert.deepEqual(results.sort(), ['allowed', 'limited']);
  assert.equal(seen[0]?.key, seen[1]?.key);
  assert.equal(seen[0]?.key.includes(marker), false);
  assert.deepEqual(
    { capacity: seen[0]?.capacity, refillPerSec: seen[0]?.refillPerSec, cost: seen[0]?.cost },
    { capacity: 1, refillPerSec: 0, cost: 1 },
  );
});
