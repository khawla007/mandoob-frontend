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
  const accent = styles.match(/--brand-accent:\s*(#[0-9a-f]{6})/iu)?.[1];
  assert.ok(accent, 'expected a hexadecimal brand accent token');
  assert.ok(
    contrastRatio(accent, '#ffffff') >= 4.5,
    `primary contrast was ${contrastRatio(accent, '#ffffff').toFixed(2)}:1`,
  );
});
