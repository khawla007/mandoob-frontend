import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Admin management primitive render contracts run with client React exports', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest('unavailable actions are disabled and explain the missing dependency', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { AdminUnavailableAction } = await import('./AdminUnavailableAction');
  const html = renderToStaticMarkup(
    <AdminUnavailableAction
      label="Export report"
      explanation="Unavailable — Phase 3 contract required"
    />,
  );

  assert.match(html, /<button[^>]*disabled/u);
  assert.match(html, /aria-describedby=/u);
  assert.match(html, /Unavailable — Phase 3 contract required/u);
  assert.doesNotMatch(html, /href=/u);
});

renderTest('unavailable workspace preserves task geometry without a command hero', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { AdminUnavailableWorkspace } = await import('./AdminUnavailableWorkspace');
  const html = renderToStaticMarkup(
    <AdminUnavailableWorkspace
      title="Document review queue"
      description="Review document work across authorized Companies."
      unavailableTitle="Unavailable — Phase 3 contract required"
      unavailableDescription="A cross-company read contract is not available."
      guidance="Requested, submitted, under review, approved and rejected states will appear here."
    />,
  );

  assert.equal((html.match(/<h2\b/gu) ?? []).length, 2);
  assert.match(html, /data-admin-module-workspace="unavailable"/u);
  assert.match(html, /Requested, submitted, under review, approved and rejected/u);
  assert.doesNotMatch(html, /command-dashboard|signal-command-hero/iu);
});
