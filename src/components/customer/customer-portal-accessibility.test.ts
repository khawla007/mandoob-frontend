import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('customer landmark markup contracts run under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

const layout = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(customer)/layout.tsx', import.meta.url),
  'utf8',
);
const paymentHistory = readFileSync(new URL('./PaymentHistoryCard.tsx', import.meta.url), 'utf8');

test('customer portal content is contained by one main landmark', () => {
  assert.match(
    layout,
    /<CustomerPortalMain>[\s\S]*className="mb-3 flex items-center gap-3"[\s\S]*<CustomerTopNav[^>]*\/>[\s\S]*\{children\}[\s\S]*<\/CustomerPortalMain>/u,
  );
});

renderTest('customer portal frame renders one canonical main around all page content', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CustomerPortalMain } = await import('./CustomerPortalMain');
  const html = renderToStaticMarkup(
    React.createElement(
      CustomerPortalMain,
      null,
      React.createElement('header', null, 'Brand'),
      React.createElement('nav', { 'aria-label': 'Portal' }, 'Navigation'),
      React.createElement('section', null, 'Page content'),
    ),
  );
  assert.equal(html.match(/<main\b/gu)?.length, 1);
  assert.match(
    html,
    /^<main id="main-content"><header>[\s\S]*<nav[\s\S]*<section[\s\S]*<\/main>$/u,
  );
});

test('payment subsection headings follow the portal page heading', () => {
  assert.doesNotMatch(paymentHistory, /<h3/u);
  assert.equal(paymentHistory.match(/<h2/gu)?.length, 2);
});
