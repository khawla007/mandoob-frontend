import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('company applied-filter markup runs under the client React export condition', () => {
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

renderTest('renders every applied company filter and one explicit reset link', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CompanyAppliedFilters } = await import('./CompanyAppliedFilters');
  const html = renderToStaticMarkup(
    React.createElement(CompanyAppliedFilters, {
      query: {
        q: 'Acme',
        status: 'active',
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
      labels: {
        heading: 'Applied filters',
        search: 'Search: Acme',
        status: 'Status: Active',
        tenant: 'Workspace: 11111111-1111-4111-8111-111111111111',
        reset: 'Reset filters',
      },
    }),
  );
  assert.match(html, /aria-label="Applied filters"/u);
  assert.match(html, /Search: Acme/u);
  assert.match(html, /Status: Active/u);
  assert.match(html, /Workspace: 11111111-1111-4111-8111-111111111111/u);
  assert.equal((html.match(/href="\/admin\/companies"/gu) ?? []).length, 1);
});
