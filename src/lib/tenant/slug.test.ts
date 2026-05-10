import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseTenantSlug, suggestTenantSlug } from './slug';

test('baseTenantSlug builds deterministic tenant-safe slugs from names', () => {
  assert.equal(baseTenantSlug('Acme PRO Services LLC'), 'acme-pro-services-llc');
  assert.equal(baseTenantSlug('  Dubai & Abu Dhabi PRO  '), 'dubai-abu-dhabi-pro');
  assert.equal(baseTenantSlug('A'), 'tenant');
});

test('suggestTenantSlug appends numeric suffixes for collisions', () => {
  const taken = new Set(['acme-pro', 'acme-pro-2']);
  assert.equal(suggestTenantSlug('Acme PRO', taken), 'acme-pro-3');
});

test('suggestTenantSlug never returns reserved labels', () => {
  assert.equal(suggestTenantSlug('Admin', new Set()), 'admin-2');
  assert.equal(suggestTenantSlug('Dashboard', new Set(['dashboard-2'])), 'dashboard-3');
});
