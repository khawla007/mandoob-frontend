import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Admin oversight render contract runs with client React exports', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest('renders decision summaries, filters, queue geometry and unavailable actions', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { AdminOversightWorkspace } = await import('./AdminOversightWorkspace');
  const html = renderToStaticMarkup(
    <AdminOversightWorkspace
      summaries={['Requested', 'Under review', 'Rejected']}
      filters={['Company', 'Status', 'Document type']}
      queueTitle="Document review queue"
      queueDescription="Cross-company document review requires an accepted source contract."
      stateGuidance="Requested, submitted, under review, approved and rejected states."
      unavailableTitle="Unavailable — Phase 3 contract required"
      unavailableDescription="No accepted cross-company document review read exists."
      actionLabel="Review document"
      actionExplanation="Unavailable — Phase 3 mutation contract required"
    />,
  );

  assert.equal((html.match(/data-admin-summary=/gu) ?? []).length, 3);
  assert.equal((html.match(/data-admin-filter=/gu) ?? []).length, 3);
  assert.match(html, /data-admin-queue=/u);
  assert.match(html, /<button[^>]*disabled/u);
  assert.match(html, /Phase 3 mutation contract required/u);
  assert.doesNotMatch(html, /command-dashboard|client/iu);
});
