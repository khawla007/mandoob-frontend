import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProRegistryHref,
  parseProRegistryParams,
  PRO_REGISTRY_DEFAULTS,
} from './pro-registry-params';

test('PRO registry parameters keep the fixed role and normalize approved filters', () => {
  const parsed = parseProRegistryParams({
    role: 'pro',
    q: '  Fatima  ',
    accountStatus: 'active',
    credentialState: 'verified',
    eligibility: 'eligible',
    assignment: 'unassigned',
    expiryWindow: '30_days',
    sort: 'credential_expiry',
    direction: 'asc',
    page: '2',
  });
  assert.equal(parsed.invalid, false);
  assert.deepEqual(parsed.filters, {
    role: 'pro',
    q: 'Fatima',
    accountStatus: 'active',
    credentialState: 'verified',
    eligibility: 'eligible',
    assignment: 'unassigned',
    expiryWindow: '30_days',
    sort: 'credential_expiry',
    direction: 'asc',
    page: 2,
  });
});

test('unknown, repeated, unsafe, and out-of-range parameters fall back deterministically', () => {
  for (const input of [
    { role: 'pro', extra: 'unsafe' },
    { role: ['pro', 'pro'] },
    { role: 'customer' },
    { role: 'pro', sort: 'email' },
    { role: 'pro', page: '0' },
    { role: 'pro', page: '1000001' },
  ]) {
    assert.deepEqual(parseProRegistryParams(input), {
      filters: PRO_REGISTRY_DEFAULTS,
      invalid: true,
    });
  }
});

test('registry URLs preserve context, reset page on filters, and expose a stable reset URL', () => {
  const current = {
    role: 'pro' as const,
    q: 'Fatima',
    accountStatus: 'active' as const,
    sort: 'full_name' as const,
    direction: 'asc' as const,
    page: 4,
  };
  assert.equal(
    buildProRegistryHref(current, { credentialState: 'verified' }),
    '/admin/users?role=pro&q=Fatima&accountStatus=active&credentialState=verified&sort=full_name&direction=asc',
  );
  assert.equal(
    buildProRegistryHref(current, { page: 3 }),
    '/admin/users?role=pro&q=Fatima&accountStatus=active&sort=full_name&direction=asc&page=3',
  );
  assert.equal(buildProRegistryHref(current, { reset: true }), '/admin/users?role=pro');
});
