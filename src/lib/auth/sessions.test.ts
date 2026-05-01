process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

import { test } from 'node:test';
import assert from 'node:assert/strict';

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
