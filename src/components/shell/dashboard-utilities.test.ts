import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('notification utility uses a discriminated truthful state without a fabricated default count', () => {
  const source = readFileSync(new URL('./DashboardNotifications.tsx', import.meta.url), 'utf8');
  assert.match(source, /status: 'available'/u);
  assert.match(source, /status: 'empty'/u);
  assert.match(source, /status: 'unavailable'/u);
  assert.match(source, /role="status"/u);
  assert.doesNotMatch(source, /\bcount\s*=\s*[1-9]/u);
});

test('account menu keeps identity, role-aware links, and keyboard-managed logout together', () => {
  const source = readFileSync(new URL('./DashboardAccountMenu.tsx', import.meta.url), 'utf8');
  assert.match(source, /<DropdownMenu/u);
  assert.match(source, /<DropdownMenuTrigger asChild>/u);
  assert.match(source, /user\.email/u);
  assert.match(source, /user\.role/u);
  assert.match(source, /<LogoutMenuItem/u);
});

test('account menu trigger has an opaque focus ring and a 44px minimum target', () => {
  const source = readFileSync(new URL('./DashboardAccountMenu.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="[^"]*min-h-11[^"]*"/u);
  assert.match(source, /className="[^"]*min-w-11[^"]*"/u);
  assert.match(source, /className="[^"]*focus-visible:ring-ring[^"]*"/u);
  assert.doesNotMatch(source, /focus-visible:ring-ring\/50/u);
});

test('each role account model points only to an existing settings or account route', async () => {
  const { buildDashboardAccountLinks } = await import('@/lib/shell/dashboard-account-model');
  assert.deepEqual(
    buildDashboardAccountLinks('admin').map((item) => item.href),
    ['/admin/settings', '/admin/security'],
  );
  assert.deepEqual(
    buildDashboardAccountLinks('pro', 'acme').map((item) => item.href),
    ['/t/acme/settings', '/account/security', '/account/sessions'],
  );
  assert.deepEqual(
    buildDashboardAccountLinks('customer', 'acme').map((item) => item.href),
    ['/account', '/account/security', '/t/acme/portal/account/erasure'],
  );
  assert.deepEqual(
    buildDashboardAccountLinks('employee', 'acme').map((item) => item.href),
    ['/t/acme/employee/settings', '/t/acme/employee/settings/security'],
  );
});
