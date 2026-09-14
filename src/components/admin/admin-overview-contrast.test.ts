import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('admin overview contrast contracts run under the client React export condition', () => {
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

renderTest(
  'admin overview metric deltas consume the shared light and dark semantic foreground',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StatCard } = await import('./StatCard');
    const markup = renderToStaticMarkup(
      React.createElement(StatCard, {
        label: 'Users',
        value: '1',
        delta: 1,
        deltaLabel: 'since yesterday',
      }),
    );

    const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
    assert.match(markup, /text-\[var\(--signal-success-foreground\)\]/u);
    assert.match(styles, /:root[\s\S]*--signal-success-foreground:/u);
    assert.match(styles, /\.dark[\s\S]*--signal-success-foreground:/u);
  },
);

renderTest('admin failed-login badge uses the shared semantic urgent treatment', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Badge } = await import('../ui/badge');
  const table = readFileSync(new URL('./RecentLoginsTable.tsx', import.meta.url), 'utf8');
  const className = 'signal-status signal-status--urgent';
  const markup = renderToStaticMarkup(
    React.createElement(Badge, { variant: 'destructive', className }, 'Failed'),
  );

  assert.match(table, /signal-status signal-status--urgent/u);
  assert.match(
    table,
    /roleBadgeVariant\[r\.role\] === 'destructive'[\s\S]*signal-status signal-status--urgent/u,
    'destructive role badges must use the same scoped accessible pair',
  );
  assert.match(markup, /signal-status--urgent/u);
});
