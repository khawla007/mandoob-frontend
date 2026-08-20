import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('primary contrast markup contract runs under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
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

renderTest('small accent copy meets AA against light and dark dashboard surfaces', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  const page = readFileSync(
    new URL('../../app/(tenant)/t/[tenant]/(pro)/company/page.tsx', import.meta.url),
    'utf8',
  );
  const dashboardScope =
    styles.match(/body:has\(\.dashboard-surface\)\s*\{([\s\S]*?)\}/u)?.[1] ?? '';
  const darkDashboardScope =
    styles.match(/\.dark body:has\(\.dashboard-surface\)\s*\{([\s\S]*?)\}/u)?.[1] ?? '';
  const lightAccent = dashboardScope.match(/--signal-accent-copy:\s*(#[0-9a-f]{6})/iu)?.[1];
  const darkAccent = darkDashboardScope.match(/--signal-accent-copy:\s*(#[0-9a-f]{6})/iu)?.[1];
  assert.ok(lightAccent && darkAccent, 'expected light and dark accent-copy tokens');
  assert.ok(contrastRatio(lightAccent, '#ffffff') >= 4.5);
  assert.ok(contrastRatio(darkAccent, '#141312') >= 4.5);
  const darkPrimary = darkDashboardScope.match(/--primary:\s*(#[0-9a-f]{6})/iu)?.[1];
  const darkPrimaryForeground = darkDashboardScope.match(
    /--primary-foreground:\s*(#[0-9a-f]{6})/iu,
  )?.[1];
  assert.ok(darkPrimary && darkPrimaryForeground, 'expected a dark dashboard primary pair');
  assert.ok(contrastRatio(darkPrimary, '#141312') >= 4.5, 'dark text-primary must meet AA');
  assert.ok(
    contrastRatio(darkPrimary, darkPrimaryForeground) >= 4.5,
    'dark default controls must meet AA',
  );
  assert.match(styles, /--color-signal-accent-copy:\s*var\(--signal-accent-copy\)/u);
  assert.match(page, /className="text-signal-accent-copy font-mono text-xs/u);
  assert.match(
    renderToStaticMarkup(
      React.createElement('p', { className: 'text-signal-accent-copy text-xs' }, 'Eyebrow'),
    ),
    /class="text-signal-accent-copy text-xs"/u,
  );
});

renderTest('default dashboard action and status primitives meet AA contrast', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Button } = await import('./button');
  const { Badge } = await import('./badge');
  const markup = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Button, null, 'Action'),
      React.createElement(Badge, null, 'Status'),
    ),
  );
  assert.match(markup, /bg-primary/u);
  assert.match(markup, /text-primary-foreground/u);

  const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  const dashboardScope =
    styles.match(/body:has\(\.dashboard-surface\)\s*\{([\s\S]*?)\}/u)?.[1] ?? '';
  const accent = dashboardScope.match(/--primary:\s*(#[0-9a-f]{6})/iu)?.[1];
  const foreground = dashboardScope.match(/--primary-foreground:\s*(#[0-9a-f]{6})/iu)?.[1];
  assert.ok(accent, 'expected a dashboard-scoped primary token');
  assert.ok(foreground, 'expected a dashboard-scoped primary foreground');
  assert.ok(
    contrastRatio(accent, foreground) >= 4.5,
    `primary contrast was ${contrastRatio(accent, foreground).toFixed(2)}:1`,
  );
});

test('public brand, marketing, chart, and focus-ring primitives remain unchanged', () => {
  const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  const rootBlock = styles.match(/:root\s*\{([\s\S]*?)\}/u)?.[1] ?? '';
  assert.match(rootBlock, /--brand-accent:\s*#ff5722/u);
  assert.match(rootBlock, /--primary:\s*var\(--brand-accent\)/u);
  assert.match(rootBlock, /--ring:\s*var\(--brand-accent\)/u);
  assert.match(rootBlock, /--chart-1:\s*var\(--brand-accent\)/u);
  assert.doesNotMatch(rootBlock, /--signal-accent-copy/u);
});
