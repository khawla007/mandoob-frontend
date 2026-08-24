import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('PRO lifecycle recovery markup runs under the client React export condition', () => {
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

renderTest('each optional source renders sanitized semantic GET recovery', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ProLifecycleRecoveryPanel } = await import('./ProLifecycleRecoveryPanel');
  for (const source of ['Credential', 'Commercial terms', 'Lifecycle history']) {
    const html = renderToStaticMarkup(
      React.createElement(ProLifecycleRecoveryPanel, {
        title: source,
        description: `${source} is temporarily unavailable.`,
        retryLabel: `Retry ${source}`,
        action: '/admin/users/22222222-2222-4222-8222-222222222222',
      }),
    );
    assert.match(html, /role="status"/u);
    assert.match(html, /aria-live="polite"/u);
    assert.match(html, /<form[^>]*action="\/admin\/users\/2222/u);
    assert.match(html, /method="get"/u);
    assert.match(html, /type="submit"/u);
    assert.match(html, /min-h-11/u);
    assert.doesNotMatch(html, /database|storage|stack|error code/iu);
  }
});

renderTest('timeline retry preserves the validated failed cursor', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ProLifecycleRecoveryPanel } = await import('./ProLifecycleRecoveryPanel');
  const cursor = 'eyJldmVudEF0IjoiMjAyNi0wOC0yMVQxMDowMDowMC4wMDBaIn0';
  const html = renderToStaticMarkup(
    React.createElement(ProLifecycleRecoveryPanel, {
      title: 'Lifecycle history',
      description: 'History is temporarily unavailable.',
      retryLabel: 'Retry lifecycle history',
      action: '/admin/users/22222222-2222-4222-8222-222222222222',
      retryCursor: cursor,
    }),
  );
  assert.match(html, /name="timeline"/u);
  assert.match(html, new RegExp(`value="${cursor}"`, 'u'));
  assert.doesNotMatch(html, /href=/u);
});

renderTest('all registry account states render text with distinct Lucide semantics', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ProAccountStatusBadge } = await import('./ProLifecycleStatusBadge');
  for (const status of ['active', 'invited', 'inactive', 'disabled', 'suspended'] as const) {
    const html = renderToStaticMarkup(
      React.createElement(ProAccountStatusBadge, { status, label: `localized-${status}` }),
    );
    assert.match(html, new RegExp(`localized-${status}`, 'u'));
    assert.match(html, /<svg[^>]*aria-hidden="true"/u);
    assert.match(html, /data-variant=/u);
  }
});
