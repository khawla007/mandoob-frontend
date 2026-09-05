import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Admin platform designs render with client React exports', () => {
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

const labels = new Proxy(
  {},
  {
    get: (_target, property) => String(property),
  },
) as Record<string, string>;

renderTest('report, compliance and status designs never imply export or live health', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ReportCatalogUnavailable } = await import('./ReportCatalogUnavailable');
  const { ComplianceOverviewUnavailable } = await import('./ComplianceOverviewUnavailable');
  const { SystemStatusUnavailable } = await import('./SystemStatusUnavailable');
  const html = [
    <ReportCatalogUnavailable key="reports" labels={labels} />,
    <ComplianceOverviewUnavailable key="compliance" labels={labels} />,
    <SystemStatusUnavailable key="status" labels={labels} />,
  ]
    .map((component) => renderToStaticMarkup(component))
    .join('');

  assert.match(html, /catalog|scope|period|format|delivery/iu);
  assert.match(html, /controls|evidence|retention|erasure/iu);
  assert.match(html, /generated|monitoring|source/iu);
  assert.equal((html.match(/<button[^>]*disabled/gu) ?? []).length, 3);
  assert.doesNotMatch(html, /realtime|data-live="true"/iu);
});

renderTest('plan design exposes allowances and add-ons without editable plan records', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PlanManagementUnavailable } = await import('./PlanManagementUnavailable');
  const html = renderToStaticMarkup(<PlanManagementUnavailable labels={labels} />);

  assert.match(html, /cadence|allowances|addOns|enforcement/iu);
  assert.match(html, /<button[^>]*disabled/u);
  assert.doesNotMatch(html, /AED\s*\d|USD|Starter|Professional|Enterprise/u);
});

renderTest(
  'questionnaire design exposes the complete editor and conflict state geometry',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { QuestionnaireBuilderUnavailable } = await import('./QuestionnaireBuilderUnavailable');
    const html = renderToStaticMarkup(<QuestionnaireBuilderUnavailable labels={labels} />);

    for (const field of [
      'questionType',
      'label',
      'help',
      'required',
      'options',
      'validation',
      'conditional',
      'consent',
    ]) {
      assert.match(html, new RegExp(field, 'u'));
    }
    for (const state of [
      'dirty',
      'validating',
      'pending',
      'success',
      'conflict',
      'unavailable',
      'error',
    ]) {
      assert.match(html, new RegExp(state, 'u'));
    }
    assert.equal((html.match(/<button[^>]*disabled/gu) ?? []).length, 7);
    assert.doesNotMatch(html, /defaultQuestions|fixture|mock/iu);
  },
);
