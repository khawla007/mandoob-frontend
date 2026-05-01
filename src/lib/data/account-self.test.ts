// Set env before any import that touches @/lib/env or @/lib/crypto/pii
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type AccountSelfModule = typeof import('./account-self');
let mod: AccountSelfModule | null = null;
async function loadMod(): Promise<AccountSelfModule> {
  if (!mod) mod = await import('./account-self');
  return mod;
}

test('diffProfile detects display_name change', async () => {
  const { diffProfile } = await loadMod();
  const d = diffProfile(
    { full_name: 'Old', phone: '+971500000000' },
    { display_name: 'New', phone: '+971500000000' },
  );
  assert.deepEqual(d.changedKeys, ['full_name']);
  assert.equal(d.update.full_name, 'New');
});

test('diffProfile no-op returns empty changedKeys', async () => {
  const { diffProfile } = await loadMod();
  const d = diffProfile(
    { full_name: 'Same', phone: '+971500000000' },
    { display_name: 'Same', phone: '+971500000000' },
  );
  assert.deepEqual(d.changedKeys, []);
});

test('buildRoleUpdate for pro encrypts license_no', async () => {
  const { buildRoleUpdate } = await loadMod();
  const u = buildRoleUpdate('pro', {
    license_no: 'L-123',
    designation: 'PRO',
    department: 'Ops',
    service_areas: ['Dubai'],
    bio: null,
  });
  assert.equal(typeof u.license_no_encrypted, 'string');
  assert.equal(u.designation, 'PRO');
});

test('buildRoleUpdate for customer encrypts passport_no', async () => {
  const { buildRoleUpdate } = await loadMod();
  const u = buildRoleUpdate('customer', {
    nationality: 'AE',
    passport_no: 'A1234567',
  });
  assert.equal(typeof u.passport_no_encrypted, 'string');
  assert.equal(u.nationality, 'AE');
});

test('buildRoleUpdate for employee writes only passport_no_encrypted', async () => {
  const { buildRoleUpdate } = await loadMod();
  const u = buildRoleUpdate('employee', { passport_no: 'B7654321' });
  assert.equal(typeof u.passport_no_encrypted, 'string');
  assert.equal('visa_no_encrypted' in u, false);
});
