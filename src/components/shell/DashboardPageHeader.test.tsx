import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('DashboardPageHeader render contracts run under the client React export condition', () => {
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

renderTest('DashboardPageHeader renders one h1 and ordered optional controls', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { DashboardPageHeader } = await import('./DashboardPageHeader');
  const longTitle = 'Company operational workspace '.repeat(8).trim();
  const html = renderToStaticMarkup(
    React.createElement(DashboardPageHeader, {
      eyebrow: 'Company portal',
      title: longTitle,
      description: 'Review current work and choose the next safe action.',
      filters: React.createElement('button', null, 'Filter'),
      secondaryAction: React.createElement('a', { href: '/settings' }, 'Settings'),
      primaryAction: React.createElement('a', { href: '/documents' }, 'Documents'),
    }),
  );

  assert.equal(html.match(/<h1\b/gu)?.length, 1);
  assert.match(html, new RegExp(`title="${longTitle}"`, 'u'));
  assert.ok(html.indexOf('Filter') < html.indexOf('Settings'));
  assert.ok(html.indexOf('Settings') < html.indexOf('Documents'));
});
