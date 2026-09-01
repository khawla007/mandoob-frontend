import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(customer)/layout.tsx', import.meta.url),
  'utf8',
);
const paymentHistory = readFileSync(new URL('./PaymentHistoryCard.tsx', import.meta.url), 'utf8');

test('Customer portal uses the canonical role-aware dashboard shell', () => {
  assert.match(layout, /<DashboardLayout[\s\S]*navKind="customer"/u);
  assert.match(layout, /brandSubtitle=\{t\('companyPortal'\)\}/u);
  assert.match(layout, /<TenantSuspendedBanner/u);
  assert.match(layout, /branding\.termsUrl/u);
  assert.match(layout, /branding\.privacyUrl/u);
  assert.doesNotMatch(layout, /CustomerTopNav|CustomerPortalMain/u);
});

test('Customer portal verifies authoritative tenant membership without revealing mismatches', () => {
  assert.match(layout, /requireCustomerTenantRouteAccess\(slug\)/u);
  assert.doesNotMatch(layout, /requireRole|resolveTenantBySlug/u);
});

test('retired Customer horizontal shell files have no remaining consumers', () => {
  const topNav = new URL('./CustomerTopNav.tsx', import.meta.url);
  const portalMain = new URL('./CustomerPortalMain.tsx', import.meta.url);
  assert.equal(existsSync(topNav), false);
  assert.equal(existsSync(portalMain), false);
});

test('payment subsection headings follow the portal page heading', () => {
  assert.doesNotMatch(paymentHistory, /<h3/u);
  assert.equal(paymentHistory.match(/<h2/gu)?.length, 2);
});
