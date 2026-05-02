// Set env vars BEFORE any import that reaches lib/env.ts. The schema there
// validates process.env at module load — once. Tests that touch env-bound
// modules must seed process.env before the first dynamic import.
const SUPABASE_URL = 'https://test.supabase.co';
const SERVICE_KEY = 'service_role_key_for_tests_padded_to_min_length_';
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('revokeAllSessions', () => {
  let originalFetch: typeof fetch;
  let calls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to GoTrue admin logout with scope=global and service-role auth', async () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    };
    const { revokeAllSessions } = await import('./revoke-sessions');
    await revokeAllSessions(userId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`);
    assert.equal(calls[0].init?.method, 'POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${SERVICE_KEY}`);
    assert.equal(headers.apikey, SERVICE_KEY);
    assert.equal(calls[0].init?.body, JSON.stringify({ scope: 'global' }));
  });

  it('throws when GoTrue returns non-2xx', async () => {
    globalThis.fetch = async () => new Response('user not found', { status: 404 });
    const { revokeAllSessions } = await import('./revoke-sessions');
    await assert.rejects(
      () => revokeAllSessions('does-not-exist'),
      /revokeAllSessions failed: 404 user not found/,
    );
  });
});
