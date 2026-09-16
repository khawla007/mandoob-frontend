import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';
import type { AdminCommandDashboard } from '@/lib/data/admin-command-dashboard';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('Admin command dashboard render contracts run under the client React export condition', () => {
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

const dashboard: AdminCommandDashboard = {
  period: {
    days: 30,
    generatedAt: '2026-09-01T10:30:00.000Z',
    current: {
      start: '2026-08-02T20:00:00.000Z',
      end: '2026-09-01T20:00:00.000Z',
      startDate: '2026-08-03',
      endDate: '2026-09-01',
    },
    comparison: {
      start: '2026-07-03T20:00:00.000Z',
      end: '2026-08-02T20:00:00.000Z',
      startDate: '2026-07-04',
      endDate: '2026-08-02',
    },
  },
  kpis: {
    totalLeads: { state: 'data', data: { value: 0 } },
    totalPros: { state: 'data', data: { value: 7 } },
    totalCompanies: { state: 'data', data: { value: 8 } },
    activeAssignments: { state: 'data', data: { value: 5 } },
    unassignedPros: { state: 'data', data: { value: 1 } },
    unassignedCompanies: { state: 'data', data: { value: 3 } },
    activeRegistrations: { state: 'unavailable', reason: 'phase3' },
    pendingRenewals: { state: 'data', data: { value: 2 } },
    pendingPayments: { state: 'error', reason: 'sanitized' },
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
};

const t = (key: string, values?: Record<string, string | number | Date>) =>
  `${key}${values ? `:${JSON.stringify(values)}` : ''}`;

renderTest(
  'renders the compact reference hierarchy with ten KPI slots and six panels',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { CommandDashboard } = await import('./CommandDashboard');
    const html = renderToStaticMarkup(<CommandDashboard dashboard={dashboard} locale="en" t={t} />);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.equal((html.match(/data-kpi=/g) ?? []).length, 10);
    assert.equal((html.match(/data-kpi-priority="primary"/g) ?? []).length, 4);
    assert.equal((html.match(/data-kpi-priority="secondary"/g) ?? []).length, 6);
    assert.equal((html.match(/data-dashboard-panel=/g) ?? []).length, 6);
    assert.equal((html.match(/data-kpi-mark=/g) ?? []).length, 6);
    assert.match(html, /data-widget-state="error"/u);
    assert.match(html, /data-widget-state="unavailable"/u);
    assert.match(html, /data-platform-signal/u);
    assert.match(html, /admin-signal-dashboard__main/u);
    assert.match(html, /admin-signal-dashboard__rail/u);
    assert.match(html, />0</u);
    assert.match(html, /unavailable\.phase3/u);
    assert.match(html, /period\.range/u);
    assert.match(html, /generatedAt/u);
    assert.match(html, /href="\/admin\/leads"/u);
    assert.match(html, /href="\/admin\/companies"/u);
    assert.doesNotMatch(html, /live|client|% this month/iu);
  },
);

renderTest('includes visible lead and panel text alternatives', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CommandDashboard } = await import('./CommandDashboard');
  const html = renderToStaticMarkup(<CommandDashboard dashboard={dashboard} locale="en" t={t} />);
  assert.match(html, /<table/u);
  assert.match(html, /panels\.leadFunnel\.denominator/u);
  assert.match(html, /panels\.registrationOverview\.description/u);
});
