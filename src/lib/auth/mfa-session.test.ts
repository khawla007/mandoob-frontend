import assert from 'node:assert/strict';
import test from 'node:test';

import { persistVerifiedMfaSession } from './mfa-session';

test('persists the verified MFA tokens before reporting challenge success', async () => {
  const calls: Array<{ access_token: string; refresh_token: string }> = [];
  const result = await persistVerifiedMfaSession(
    {
      setSession: async (tokens) => {
        calls.push(tokens);
        return { error: null };
      },
    },
    { access_token: 'new-access', refresh_token: 'new-refresh' },
  );
  assert.equal(result, true);
  assert.deepEqual(calls, [{ access_token: 'new-access', refresh_token: 'new-refresh' }]);
});

test('fails closed when the verified MFA session cannot be persisted', async () => {
  assert.equal(
    await persistVerifiedMfaSession(
      { setSession: async () => ({ error: { message: 'not persisted' } }) },
      { access_token: 'new-access', refresh_token: 'new-refresh' },
    ),
    false,
  );
});
