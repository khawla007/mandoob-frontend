import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3102';

const raw: SessionProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'actor@example.test',
  role: 'pro',
  tenantId: 'stale-tenant',
  aal: 'aal1',
  mfaEnrolled: true,
};

test('requireUser returns only a freshly authorized active identity', async () => {
  const { resolveRequiredUser } = await import('./require-user');
  const authoritative = { ...raw, tenantId: '00000000-0000-0000-0000-000000000002' };
  const seen: SessionProfile[] = [];
  const result = await resolveRequiredUser(raw, async (session) => {
    seen.push(session);
    return authoritative;
  });
  assert.deepEqual(seen, [raw]);
  assert.equal(result, authoritative);
});

test('requireUser rejects stale role, status, tenant, or released assignment state', async () => {
  const { resolveRequiredUser } = await import('./require-user');
  await assert.rejects(() => resolveRequiredUser(raw, async () => null), /UNAUTHENTICATED/u);
});
