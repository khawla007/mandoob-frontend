import assert from 'node:assert/strict';
import test from 'node:test';
import { runRateLimitedFinancialEffect } from './effect-rate-limit';

test('a denied financial-effect rate limit cannot execute the provider or reservation callback', async () => {
  let effects = 0;
  const result = await runRateLimitedFinancialEffect(
    async () => 'limited',
    async () => {
      effects += 1;
      return 'created';
    },
  );
  assert.deepEqual(result, { allowed: false });
  assert.equal(effects, 0);
});

test('an allowed financial-effect rate limit executes exactly once', async () => {
  let effects = 0;
  const result = await runRateLimitedFinancialEffect(
    async () => 'allowed',
    async () => {
      effects += 1;
      return 'created';
    },
  );
  assert.deepEqual(result, { allowed: true, value: 'created' });
  assert.equal(effects, 1);
});
