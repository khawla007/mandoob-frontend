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

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  assert.ok(channels && channels.length === 3);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

renderTest('admin overview metric deltas render with AA light and dark foregrounds', async () => {
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

  assert.match(markup, /text-emerald-700/u);
  assert.match(markup, /dark:text-emerald-400/u);
  assert.ok(contrastRatio('#007a55', '#ffffff') >= 4.5);
  assert.ok(contrastRatio('#00d492', '#141312') >= 4.5);
});

renderTest('admin failed-login badge uses a scoped AA pair in light and dark modes', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Badge } = await import('../ui/badge');
  const table = readFileSync(new URL('./RecentLoginsTable.tsx', import.meta.url), 'utf8');
  const className = 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200';
  const markup = renderToStaticMarkup(
    React.createElement(Badge, { variant: 'destructive', className }, 'Failed'),
  );

  assert.match(table, /bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200/u);
  assert.match(
    table,
    /roleBadgeVariant\[r\.role\] === 'destructive'[\s\S]*bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200/u,
    'destructive role badges must use the same scoped accessible pair',
  );
  assert.match(markup, /bg-red-50/u);
  assert.match(markup, /dark:bg-red-950/u);
  assert.ok(contrastRatio('#c10007', '#fff1f2') >= 4.5);
  assert.ok(contrastRatio('#ffc9c9', '#460809') >= 4.5);
});
