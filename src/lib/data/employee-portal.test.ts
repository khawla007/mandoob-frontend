process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/errors';

type Mod = typeof import('./employee-portal');
let mod: Mod | null = null;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('./employee-portal');
  return mod;
}

test('daysUntilExpiry is deterministic from an explicit today date', async () => {
  const { daysUntilExpiry } = await load();
  assert.equal(daysUntilExpiry('2026-06-09', new Date('2026-05-10T12:00:00Z')), 30);
  assert.equal(daysUntilExpiry('2026-05-09', new Date('2026-05-10T12:00:00Z')), -1);
  assert.equal(daysUntilExpiry(null, new Date('2026-05-10T12:00:00Z')), null);
});

test('expiryBucket labels missing, expired, critical, soon, and ok windows', async () => {
  const { expiryBucket } = await load();
  assert.equal(expiryBucket(null), 'missing');
  assert.equal(expiryBucket(-1), 'expired');
  assert.equal(expiryBucket(10), 'critical');
  assert.equal(expiryBucket(60), 'soon');
  assert.equal(expiryBucket(120), 'ok');
});

test('assertOwnedActiveEmployee rejects cross-tenant access', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-1',
          status: 'active',
        },
        'profile-1',
        'tenant-b',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});

test('assertOwnedActiveEmployee rejects another employee profile', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-2',
          status: 'active',
        },
        'profile-1',
        'tenant-a',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});

test('assertOwnedActiveEmployee rejects inactive employees', async () => {
  const { assertOwnedActiveEmployee } = await load();
  assert.throws(
    () =>
      assertOwnedActiveEmployee(
        {
          id: 'emp-1',
          tenant_id: 'tenant-a',
          profile_id: 'profile-1',
          status: 'terminated',
        },
        'profile-1',
        'tenant-a',
      ),
    (err) => err instanceof ApiError && err.code === 'FORBIDDEN',
  );
});
