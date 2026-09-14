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

test('listUserSessions classifies only an unsupported sessions endpoint as unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response('404 page not found\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

  const { isSessionManagementUnavailableError, listUserSessions } = await import('./sessions');
  await assert.rejects(
    () => listUserSessions('user-1'),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'SESSION_MANAGEMENT_UNAVAILABLE');
      assert.equal(error.status, 503);
      assert.equal(isSessionManagementUnavailableError(error), true);
      return true;
    },
  );
});

test('listUserSessions does not classify auth, provider, or unexpected failures as unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { isSessionManagementUnavailableError, listUserSessions } = await import('./sessions');
  assert.equal(
    isSessionManagementUnavailableError({ code: 'SESSION_MANAGEMENT_UNAVAILABLE', status: 503 }),
    false,
  );
  assert.equal(
    isSessionManagementUnavailableError(
      new ApiError('SESSION_MANAGEMENT_UNAVAILABLE', 'wrong status', 500),
    ),
    false,
  );

  for (const response of [
    new Response(
      JSON.stringify({ code: 404, error_code: 'user_not_found', msg: 'User not found' }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' },
      },
    ),
    new Response('resource not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
    new Response(`404 page not found\n${'x'.repeat(128)}`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(
      () => listUserSessions('user-1'),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'INTERNAL');
        assert.equal(isSessionManagementUnavailableError(error), false);
        return true;
      },
    );
  }

  for (const status of [401, 403, 500]) {
    globalThis.fetch = async () => new Response('provider detail', { status });
    await assert.rejects(
      () => listUserSessions('user-1'),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'INTERNAL');
        assert.equal(isSessionManagementUnavailableError(error), false);
        return true;
      },
    );
  }

  const networkError = new Error('network failed');
  globalThis.fetch = async () => {
    throw networkError;
  };
  await assert.rejects(
    () => listUserSessions('user-1'),
    (error) => {
      assert.equal(error, networkError);
      assert.equal(isSessionManagementUnavailableError(error), false);
      return true;
    },
  );
});
