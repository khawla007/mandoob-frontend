import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionTenantSchema, tenantSlugSchema, SLUG_REGEX } from './tenant-onboarding';

test('SLUG_REGEX accepts valid slugs', () => {
  for (const s of ['firm', 'acme-pro', 'abc', 'multi-word-tenant', 'abc123def']) {
    assert.match(s, SLUG_REGEX, `expected '${s}' to match`);
  }
});

test('tenantSlugSchema rejects bad slugs', () => {
  for (const s of ['ab', 'A-Capital', '-leading', 'trailing-', '_underscore', 'spaces here', '']) {
    assert.equal(tenantSlugSchema.safeParse(s).success, false, `expected '${s}' to fail`);
  }
});

test('provisionTenantSchema accepts a valid admin-created tenant', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme PRO Services',
    slug: 'acme-pro',
    plan: 'starter',
    status: 'active',
    source: 'admin',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
    admin_phone: '+971501234567',
  });
  assert.equal(r.success, true);
});

test('provisionTenantSchema accepts a self-serve pending tenant', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme PRO Services',
    slug: 'acme-pro',
    plan: 'professional',
    status: 'pending',
    source: 'self_serve',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
    admin_phone: '+971501234567',
  });
  assert.equal(r.success, true);
});

test('provisionTenantSchema requires admin_phone', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme',
    slug: 'acme-pro',
    plan: 'starter',
    status: 'active',
    source: 'admin',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
  });
  assert.equal(r.success, false);
});

test('provisionTenantSchema rejects unknown plan', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme PRO Services',
    slug: 'acme-pro',
    plan: 'platinum',
    status: 'active',
    source: 'admin',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
  });
  assert.equal(r.success, false);
});

test('provisionTenantSchema rejects unknown status', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme PRO Services',
    slug: 'acme-pro',
    plan: 'starter',
    status: 'archived',
    source: 'admin',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
  });
  assert.equal(r.success, false);
});

test('provisionTenantSchema rejects bad slug', () => {
  const r = provisionTenantSchema.safeParse({
    name: 'Acme',
    slug: 'A-Capital',
    plan: 'starter',
    status: 'active',
    source: 'admin',
    admin_email: 'admin@acme.example',
    admin_full_name: 'Acme Admin',
  });
  assert.equal(r.success, false);
});
