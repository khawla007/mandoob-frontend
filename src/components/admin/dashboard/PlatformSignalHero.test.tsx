import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';
import type { AdminCommandDashboard } from '@/lib/data/admin-command-dashboard';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Platform Signal hero render contracts run under the client React export condition', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
        env,
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

const t = (key: string) => key;

const dashboard = {
  period: {
    days: 30,
    generatedAt: '2026-09-16T04:00:00.000Z',
    current: { start: '', end: '', startDate: '2026-08-18', endDate: '2026-09-16' },
    comparison: { start: '', end: '', startDate: '2026-07-19', endDate: '2026-08-17' },
  },
  kpis: {
    totalLeads: { state: 'data', data: { value: 5 } },
    totalPros: { state: 'data', data: { value: 7 } },
    totalCompanies: { state: 'data', data: { value: 8 } },
    activeAssignments: { state: 'data', data: { value: 5 } },
    unassignedPros: { state: 'data', data: { value: 0 } },
    unassignedCompanies: { state: 'error', reason: 'sanitized' },
    activeRegistrations: { state: 'unavailable', reason: 'phase3' },
    pendingRenewals: { state: 'data', data: { value: 2 } },
    pendingPayments: { state: 'data', data: { value: 3 } },
    documentsAwaitingReview: { state: 'unavailable', reason: 'phase3' },
  },
  registrationOverview: { state: 'unavailable', reason: 'phase3' },
  leadFunnel: {
    state: 'data',
    data: [
      { stage: 'new', count: 4, percentage: 80 },
      { stage: 'contacted', count: 0, percentage: 0 },
      { stage: 'qualified', count: 0, percentage: 0 },
      { stage: 'won', count: 1, percentage: 20 },
      { stage: 'lost', count: 0, percentage: 0 },
    ],
  },
  activity: { state: 'empty', data: [] },
  proHealth: { state: 'empty', data: [] },
  revenue: { state: 'unavailable', reason: 'phase3' },
  registrationStages: { state: 'unavailable', reason: 'phase3' },
} satisfies AdminCommandDashboard;

renderTest('renders independent platform facts and only real non-zero funnel marks', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PlatformSignalHero } = await import('./PlatformSignalHero');
  const html = renderToStaticMarkup(<PlatformSignalHero dashboard={dashboard} locale="en" t={t} />);
  assert.match(html, /data-platform-signal/u);
  assert.equal((html.match(/data-hero-fact=/g) ?? []).length, 4);
  assert.equal((html.match(/data-signal-mark=/g) ?? []).length, 2);
  assert.equal((html.match(/data-hero-stage=/g) ?? []).length, 5);
  assert.match(html, /href="\/admin\/leads"/u);
  assert.match(html, /href="\/admin\/companies"/u);
  assert.doesNotMatch(html, /live|score|total priority/iu);
  assert.match(html, /error\.title/u);
  assert.match(html, />0</u);
});

renderTest('does not render a visual series when the funnel source is unavailable', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PlatformSignalHero } = await import('./PlatformSignalHero');
  const html = renderToStaticMarkup(
    <PlatformSignalHero
      dashboard={{ ...dashboard, leadFunnel: { state: 'unavailable', reason: 'phase3' } }}
      locale="en"
      t={t}
    />,
  );
  assert.doesNotMatch(html, /data-signal-mark=/u);
  assert.match(html, /unavailable\.title/u);
});

renderTest('funnel error and real all-zero stages never acquire positive marks', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PlatformSignalHero } = await import('./PlatformSignalHero');
  const error = renderToStaticMarkup(
    <PlatformSignalHero
      dashboard={{ ...dashboard, leadFunnel: { state: 'error', reason: 'sanitized' } }}
      locale="en"
      t={t}
    />,
  );
  assert.match(error, /admin-platform-signal__visual-state[^>]*>dashboard.command.error.short/u);
  assert.doesNotMatch(error, /data-signal-mark=/u);
  const zero = renderToStaticMarkup(
    <PlatformSignalHero
      dashboard={{
        ...dashboard,
        leadFunnel: {
          state: 'empty',
          data: dashboard.leadFunnel.data.map((row) => ({ ...row, count: 0, percentage: 0 })),
        },
      }}
      locale="ar"
      t={t}
    />,
  );
  assert.equal((zero.match(/data-hero-stage=/g) ?? []).length, 5);
  assert.doesNotMatch(zero, /data-signal-mark=/u);
});
