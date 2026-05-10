import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantBrandingView, tenantBrandingStyle } from './branding';

test('buildTenantBrandingView validates colors and builds fallback initial', () => {
  const branding = buildTenantBrandingView({
    name: 'Acme PRO',
    logo_url: null,
    favicon_url: null,
    primary_color: '#123abc',
    secondary_color: 'red',
    terms_url: 'https://acme.test/terms',
    privacy_url: null,
  });
  assert.equal(branding.initial, 'A');
  assert.equal(branding.primaryColor, '#123abc');
  assert.equal(branding.secondaryColor, null);
  assert.equal(branding.termsUrl, 'https://acme.test/terms');
});

test('tenantBrandingStyle emits scoped CSS variables only for safe colors', () => {
  assert.deepEqual(
    tenantBrandingStyle({
      primaryColor: '#123abc',
      secondaryColor: null,
    }),
    {
      '--primary': '#123abc',
      '--ring': '#123abc',
      '--sidebar-primary': '#123abc',
      '--tenant-primary': '#123abc',
    },
  );
});
