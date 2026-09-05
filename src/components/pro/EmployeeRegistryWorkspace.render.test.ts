import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

import type { EmployeeRegistryResult } from '@/lib/data/pro-employee-registry';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('employee registry markup contracts run under the client React export condition', () => {
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

const labels = {
  total: 'Total',
  visible: 'Visible',
  page: 'Page',
  unavailableValue: 'Unavailable',
  pagination: 'Pages',
  previous: 'Previous',
  next: 'Next',
  pageCount: 'Page {current} of {total}',
};

const result: EmployeeRegistryResult = {
  state: 'data',
  rows: [],
  total: 1234,
  unfilteredTotal: 1234,
  page: 1,
  pageSize: 25,
  canonicalPage: 1,
  phase3Unavailable: true,
};

renderTest('registry signals and pagination format counts using the active locale', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { EmployeeRegistryPagination, EmployeeRegistrySignals } =
    await import('./EmployeeRegistryWorkspace');
  const locale = 'ar-AE';
  const signals = renderToStaticMarkup(
    React.createElement(EmployeeRegistrySignals, { result, labels, locale }),
  );
  const pagination = renderToStaticMarkup(
    React.createElement(EmployeeRegistryPagination, {
      slug: 'acme',
      search: { q: '', status: 'all', visa: 'any', eid: 'any', risk: 'all', page: 1, focus: null },
      result,
      labels,
      locale,
    }),
  );

  assert.match(signals, new RegExp(Intl.NumberFormat(locale).format(1234), 'u'));
  assert.match(pagination, new RegExp(Intl.NumberFormat(locale).format(1), 'u'));
  assert.match(pagination, new RegExp(Intl.NumberFormat(locale).format(50), 'u'));
});

renderTest(
  'disabled previous pagination control is a non-focusable button, not an anchor',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { EmployeeRegistryPagination } = await import('./EmployeeRegistryWorkspace');
    const html = renderToStaticMarkup(
      React.createElement(EmployeeRegistryPagination, {
        slug: 'acme',
        search: {
          q: '',
          status: 'all',
          visa: 'any',
          eid: 'any',
          risk: 'all',
          page: 1,
          focus: null,
        },
        result,
        labels,
        locale: 'en-US',
      }),
    );

    assert.match(html, /<button[^>]*disabled=""[^>]*>Previous<\/button>/u);
    assert.equal((html.match(/<a /gu) ?? []).length, 1);
  },
);
