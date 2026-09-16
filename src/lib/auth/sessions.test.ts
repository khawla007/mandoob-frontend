process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';

test('parseSessionRow extracts ip and user_agent', async () => {
  const { parseSessionRow } = await import('./sessions');
  const out = parseSessionRow({
    id: 'sess-1',
    user_id: 'user-1',
    user_agent: 'Mozilla/5.0',
    ip: '1.2.3.4',
    refreshed_at: '2026-05-01T12:00:00Z',
    created_at: '2026-04-30T08:00:00Z',
  });
  assert.equal(out.id, 'sess-1');
  assert.equal(out.userAgent, 'Mozilla/5.0');
  assert.equal(out.ip, '1.2.3.4');
  assert.equal(out.lastSeenAt, '2026-05-01T12:00:00Z');
});

test('parseSessionRow handles missing user_agent', async () => {
  const { parseSessionRow } = await import('./sessions');
  const out = parseSessionRow({
    id: 'sess-2',
    user_id: 'user-1',
    user_agent: null,
    ip: null,
    refreshed_at: null,
    created_at: '2026-04-30T08:00:00Z',
  });
  assert.equal(out.userAgent, null);
  assert.equal(out.ip, null);
  assert.equal(out.lastSeenAt, '2026-04-30T08:00:00Z');
});

test('listUserSessions reads only the requested user through the service-role store', async () => {
  const calls: string[] = [];
  const { listUserSessionsWith } = await import('./sessions');
  const sessions = await listUserSessionsWith(
    {
      list: async (userId) => {
        calls.push(userId);
        return {
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: userId,
              user_agent: 'Browser',
              ip: '127.0.0.1',
              refreshed_at: null,
              created_at: '2026-09-15T00:00:00Z',
            },
          ],
          error: null,
        };
      },
      revoke: async () => ({ data: false, error: null }),
    },
    '22222222-2222-4222-8222-222222222222',
  );

  assert.deepEqual(calls, ['22222222-2222-4222-8222-222222222222']);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.userId, '22222222-2222-4222-8222-222222222222');
});

test('revokeSessionById uses an ownership-bound RPC and hides missing sessions', async () => {
  const calls: unknown[] = [];
  const { revokeSessionByIdWith } = await import('./sessions');
  const store = {
    list: async () => ({ data: [], error: null }),
    revoke: async (userId: string, sessionId: string) => {
      calls.push({ userId, sessionId });
      return { data: true, error: null };
    },
  };

  await revokeSessionByIdWith(
    store,
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
  );
  assert.deepEqual(calls, [
    {
      userId: '22222222-2222-4222-8222-222222222222',
      sessionId: '11111111-1111-4111-8111-111111111111',
    },
  ]);

  store.revoke = async () => ({ data: false, error: null });
  await assert.rejects(
    () =>
      revokeSessionByIdWith(
        store,
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );
});

test('session store failures return sanitized errors', async () => {
  const { listUserSessionsWith, revokeSessionByIdWith } = await import('./sessions');
  const store = {
    list: async () => ({ data: null, error: new Error('postgres password raw') }),
    revoke: async () => ({ data: null, error: new Error('service key raw') }),
  };

  await assert.rejects(
    () => listUserSessionsWith(store, '22222222-2222-4222-8222-222222222222'),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      !/postgres|password|raw/iu.test(error.message),
  );
  await assert.rejects(
    () =>
      revokeSessionByIdWith(
        store,
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
      ),
    (error) =>
      error instanceof ApiError &&
      error.code === 'INTERNAL' &&
      !/service|key|raw/iu.test(error.message),
  );
});
