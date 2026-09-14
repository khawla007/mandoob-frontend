import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const clientTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('dashboard navigation model runs under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

clientTest('all four roles resolve through one typed navigation model', async () => {
  const { resolveDashboardNav } = await import('./dashboard-navigation-model');
  assert.equal(resolveDashboardNav('admin').flatMap((group) => group.items)[0]?.href, '/admin');
  assert.equal(
    resolveDashboardNav('pro', 'acme').flatMap((group) => group.items)[0]?.href,
    '/t/acme/dashboard',
  );
  assert.equal(
    resolveDashboardNav('customer', 'acme').flatMap((group) => group.items)[0]?.href,
    '/t/acme/portal',
  );
  assert.equal(
    resolveDashboardNav('employee', 'acme').flatMap((group) => group.items)[0]?.href,
    '/t/acme/employee/dashboard',
  );
});

clientTest('command entries reuse visible role navigation labels and groups only', async () => {
  const { buildDashboardCommandEntries, resolveDashboardNav } =
    await import('./dashboard-navigation-model');
  const entries = buildDashboardCommandEntries(
    resolveDashboardNav('customer', 'acme'),
    (_key, fallback) => fallback ?? '',
  );

  assert.deepEqual(
    entries.map(({ label, group, href }) => ({ label, group, href })),
    [
      { label: 'Overview', group: '', href: '/t/acme/portal' },
      { label: 'Company', group: 'Company portal', href: '/t/acme/portal/company' },
      { label: 'Registration', group: 'Company portal', href: '/t/acme/portal/registration' },
      { label: 'Tasks', group: 'Company portal', href: '/t/acme/portal/tasks' },
      { label: 'Calendar', group: 'Company portal', href: '/t/acme/portal/calendar' },
      { label: 'Documents', group: 'Company portal', href: '/t/acme/portal/documents' },
      { label: 'Employees', group: 'Company portal', href: '/t/acme/portal/employees' },
      { label: 'Meetings', group: 'Company portal', href: '/t/acme/portal/meetings' },
      { label: 'Payments', group: 'Company portal', href: '/t/acme/portal/payments' },
      { label: 'Renewals', group: 'Company portal', href: '/t/acme/portal/renewals' },
      {
        label: 'Communications',
        group: 'Company portal',
        href: '/t/acme/portal/communications',
      },
      {
        label: 'Notifications',
        group: 'Company portal',
        href: '/t/acme/portal/notifications',
      },
      { label: 'Activity', group: 'Company portal', href: '/t/acme/portal/activity' },
      { label: 'Assigned PRO', group: 'Company portal', href: '/t/acme/portal/pro' },
      { label: 'Settings', group: 'Account', href: '/t/acme/portal/settings' },
      { label: 'Profile', group: 'Account', href: '/account' },
      { label: 'Data erasure', group: 'Account', href: '/t/acme/portal/account/erasure' },
    ],
  );
  assert.equal(
    entries.some((entry) => /global|record|entity/iu.test(entry.label)),
    false,
  );
});
