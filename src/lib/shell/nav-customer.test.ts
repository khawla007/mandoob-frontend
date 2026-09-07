import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const clientTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Customer navigation contracts run under the client React export condition', () => {
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

clientTest(
  'Customer navigation uses only existing authorized portal and account destinations',
  async () => {
    const { buildCustomerNav } = await import('./nav-customer');
    const groups = buildCustomerNav('acme');
    const items = groups.flatMap((group) => group.items);

    assert.deepEqual(
      items.map((item) => item.href),
      [
        '/t/acme/portal',
        '/t/acme/portal/company',
        '/t/acme/portal/registration',
        '/t/acme/portal/tasks',
        '/t/acme/portal/calendar',
        '/t/acme/portal/documents',
        '/t/acme/portal/employees',
        '/t/acme/portal/meetings',
        '/t/acme/portal/payments',
        '/t/acme/portal/renewals',
        '/t/acme/portal/communications',
        '/t/acme/portal/notifications',
        '/t/acme/portal/activity',
        '/t/acme/portal/pro',
        '/t/acme/portal/settings',
        '/account',
        '/t/acme/portal/account/erasure',
      ],
    );
    assert.equal(
      items.some((item) => item.badge !== undefined),
      false,
    );
    assert.equal(
      items.some((item) => /client/iu.test(item.labelFallback)),
      false,
    );
    assert.equal(
      items.some((item) => /notifications|tasks/iu.test(item.href)),
      true,
    );
  },
);

clientTest(
  'Customer navigation encodes the tenant slug and resolves its active parent',
  async () => {
    const { buildCustomerNav } = await import('./nav-customer');
    const { resolveActiveShellHref } = await import('./nav-config');
    const groups = buildCustomerNav('company name');

    assert.equal(groups[0]?.items[0]?.href, '/t/company%20name/portal');
    assert.equal(
      resolveActiveShellHref(groups, '/t/company%20name/portal/documents/request'),
      '/t/company%20name/portal/documents',
    );
  },
);
