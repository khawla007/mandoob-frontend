process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/lib/errors';

test('current-password verification uses and locally revokes an isolated session', async () => {
  const calls: unknown[] = [];
  const { verifyCurrentPasswordWith } = await import('./password-change');
  const verified = await verifyCurrentPasswordWith(
    {
      signIn: async (email, password) => {
        calls.push({ email, password });
        return { userId: 'user-1', hasSession: true, error: null };
      },
      signOutLocal: async () => {
        calls.push({ scope: 'local' });
        return { error: null };
      },
    },
    'user-1',
    'user@example.com',
    'current-password',
  );

  assert.equal(verified, true);
  assert.deepEqual(calls, [
    { email: 'user@example.com', password: 'current-password' },
    { scope: 'local' },
  ]);
});

test('current-password verification rejects identity mismatch after local cleanup', async () => {
  let cleaned = false;
  const { verifyCurrentPasswordWith } = await import('./password-change');
  const verified = await verifyCurrentPasswordWith(
    {
      signIn: async () => ({ userId: 'different-user', hasSession: true, error: null }),
      signOutLocal: async () => {
        cleaned = true;
        return { error: null };
      },
    },
    'user-1',
    'user@example.com',
    'current-password',
  );
  assert.equal(verified, false);
  assert.equal(cleaned, true);
});

test('failed sign-in is a reauthentication failure without a logout attempt', async () => {
  let cleaned = false;
  const { verifyCurrentPasswordWith } = await import('./password-change');
  const verified = await verifyCurrentPasswordWith(
    {
      signIn: async () => ({ userId: null, hasSession: false, error: new Error('bad password') }),
      signOutLocal: async () => {
        cleaned = true;
        return { error: null };
      },
    },
    'user-1',
    'user@example.com',
    'wrong-password',
  );
  assert.equal(verified, false);
  assert.equal(cleaned, false);
});

test('isolated session cleanup fails closed with a sanitized error', async () => {
  const { verifyCurrentPasswordWith } = await import('./password-change');
  await assert.rejects(
    () =>
      verifyCurrentPasswordWith(
        {
          signIn: async () => ({ userId: 'user-1', hasSession: true, error: null }),
          signOutLocal: async () => ({ error: new Error('raw provider detail') }),
        },
        'user-1',
        'user@example.com',
        'current-password',
      ),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      !/raw|provider/iu.test(error.message),
  );
});
