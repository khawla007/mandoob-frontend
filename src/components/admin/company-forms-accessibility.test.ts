import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('company form markup contracts run under the client React export condition', () => {
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
  'rendered company fields connect labels, descriptions, and errors to each control',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AccessibleCompanyField } = await import('./AccessibleCompanyField');
    for (const tag of ['input', 'select', 'textarea']) {
      const html = renderToStaticMarkup(
        React.createElement(
          AccessibleCompanyField,
          {
            id: `company-${tag}`,
            label: `${tag} label`,
            description: `${tag} description`,
            error: `${tag} error`,
          },
          React.createElement(tag, { name: tag }),
        ),
      );
      assert.match(html, new RegExp(`for="company-${tag}"`, 'u'));
      assert.match(html, new RegExp(`id="company-${tag}"`, 'u'));
      assert.match(html, /aria-invalid="true"/u);
      assert.match(
        html,
        new RegExp(`aria-describedby="company-${tag}-description company-${tag}-error"`, 'u'),
      );
      assert.match(html, new RegExp(`id="company-${tag}-description"`, 'u'));
      assert.match(html, new RegExp(`id="company-${tag}-error"`, 'u'));
    }
  },
);

renderTest('pending mutation button renders disabled busy semantics', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PendingActionButton } = await import('./PendingActionButton');
  const html = renderToStaticMarkup(
    React.createElement(PendingActionButton, {
      pending: true,
      idleLabel: 'Assign PRO',
      pendingLabel: 'Saving',
    }),
  );
  assert.match(html, /disabled=""/u);
  assert.match(html, /aria-disabled="true"/u);
  assert.match(html, /aria-busy="true"/u);
  assert.match(html, />Saving</u);
});

renderTest('completed mutation button remains disabled against replay', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PendingActionButton } = await import('./PendingActionButton');
  const html = renderToStaticMarkup(
    React.createElement(PendingActionButton, {
      pending: false,
      completed: true,
      idleLabel: 'Assign PRO',
      pendingLabel: 'Saving',
    }),
  );
  assert.match(html, /disabled=""/u);
  assert.match(html, /aria-disabled="true"/u);
  assert.match(html, />Assign PRO</u);
});

test('assignment form keeps ineligible matches visible with operator-only reasons', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/admin/CompanyAssignmentForm.tsx'),
    'utf8',
  );
  assert.match(source, /disabled=\{!pro\.eligibility\.eligible\}/u);
  assert.match(source, /pro\.eligibility\.codes/u);
  assert.match(source, /operationalAccess === 'blocked'/u);
  assert.match(source, /role="status"/u);
});
