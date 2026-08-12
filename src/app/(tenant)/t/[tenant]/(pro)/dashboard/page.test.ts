import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { authorizeProDashboardRead } from './page-authorization';
import { dashboardWidgetState, parseDashboardFilters, parseDashboardRange } from './page-logic';

const pagePath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx');
const metricsPath = join(process.cwd(), 'src/lib/data/tenant-metrics.ts');
const loadingPath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/loading.tsx');
const errorPath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/error.tsx');

test('dashboard read authorization completes before a service-role dashboard read', async () => {
  const calls: string[] = [];
  const tenant = await authorizeProDashboardRead('acme', {
    requirePro: async () => {
      calls.push('auth');
      return { tenantId: 'tenant-1', role: 'pro' };
    },
    resolveTenant: async () => {
      calls.push('tenant');
      return { id: 'tenant-1', slug: 'acme', name: 'Acme', status: 'active' };
    },
    requireActive: async () => {
      calls.push('active');
    },
  });
  calls.push('read');

  assert.equal(tenant.kind, 'authorized');
  assert.equal(tenant.kind === 'authorized' ? tenant.tenant.id : null, 'tenant-1');
  assert.deepEqual(calls, ['auth', 'tenant', 'active', 'read']);
});

test('dashboard read authorization returns not-found for an exact tenant mismatch', async () => {
  const calls: string[] = [];
  const result = await authorizeProDashboardRead('acme', {
    requirePro: async () => {
      calls.push('auth');
      return { tenantId: 'tenant-2', role: 'pro' };
    },
    resolveTenant: async () => {
      calls.push('tenant');
      return { id: 'tenant-1', slug: 'acme', name: 'Acme', status: 'active' };
    },
    requireActive: async () => calls.push('active'),
  });

  assert.deepEqual(result, { kind: 'not-found' });
  assert.deepEqual(calls, ['auth', 'tenant']);
});

test('dashboard read authorization returns inactive without active/read checks', async () => {
  const calls: string[] = [];
  const result = await authorizeProDashboardRead('acme', {
    requirePro: async () => ({ tenantId: 'tenant-1', role: 'pro' }),
    resolveTenant: async () => ({
      id: 'tenant-1',
      slug: 'acme',
      name: 'Acme',
      status: 'suspended',
    }),
    requireActive: async () => calls.push('active'),
  });
  assert.equal(result.kind, 'inactive');
  assert.deepEqual(calls, []);
});

test('dashboard range parser accepts only one supported value', () => {
  assert.equal(parseDashboardRange(undefined), 30);
  assert.equal(parseDashboardRange('7'), 7);
  assert.equal(parseDashboardRange('30'), 30);
  assert.equal(parseDashboardRange('90'), 90);
  assert.equal(parseDashboardRange('bad'), 30);
  assert.equal(parseDashboardRange(['7', '90']), 30);
  assert.equal(parseDashboardRange([]), 30);
});

test('dashboard filters reject repeated/malformed values and accept schema-backed fields', () => {
  assert.deepEqual(
    parseDashboardFilters({
      owner: '11111111-1111-4111-8111-111111111111',
      serviceType: 'Golden visa',
    }),
    { ownerId: '11111111-1111-4111-8111-111111111111', serviceType: 'Golden visa' },
  );
  assert.deepEqual(parseDashboardFilters({ owner: ['a', 'b'], serviceType: ['x', 'y'] }), {});
  assert.deepEqual(parseDashboardFilters({ owner: 'bad', serviceType: 'xx' }), {
    serviceType: 'xx',
  });
});

test('dashboard widget state sanitizes only relevant loader group failures', () => {
  const errors = { finance: 'raw database error', renewals: 'raw renewal error' } as const;
  const messages = {
    identity: 'identity unavailable',
    links: 'links unavailable',
    operations: 'operations unavailable',
    renewals: 'renewals unavailable',
    documents: 'documents unavailable',
    finance: 'finance unavailable',
  };

  assert.deepEqual(
    dashboardWidgetState(errors, ['operations'], messages, '/t/acme/dashboard?range=30'),
    undefined,
  );
  assert.deepEqual(
    dashboardWidgetState(errors, ['finance'], messages, '/t/acme/dashboard?range=30'),
    {
      kind: 'error',
      message: 'finance unavailable',
      retryHref: '/t/acme/dashboard?range=30',
    },
  );
});

test('dashboard page uses async inputs, authorizes before read, and has no legacy dashboard reads', () => {
  const source = readFileSync(pagePath, 'utf8');
  const metrics = readFileSync(metricsPath, 'utf8');

  assert.match(source, /params:\s*Promise<\{ tenant: string \}>/);
  assert.match(source, /searchParams:\s*Promise</);
  assert.match(source, /await Promise\.all\(\[params, searchParams\]\)/);
  assert.ok(source.indexOf('authorizeProDashboardRead(') < source.indexOf('getProDashboardData('));
  assert.doesNotMatch(source, /SignupsChart|RecentLoginsTable|getProDashboardMetrics/);
  assert.doesNotMatch(metrics, /ProDashboardKpiKey|ProDashboardMetric|getProDashboardMetrics/);
  assert.match(source, /allBranches/);
  assert.match(source, /disabled/);
});

test('dashboard has one responsive composition and moves Action Deck before charts below lg', () => {
  const source = readFileSync(pagePath, 'utf8');
  for (const component of [
    'SignalHero',
    'SignalKpis',
    'CaseVelocityChart',
    'CollectionsWaterfall',
    'ActionDeck',
    'DeadlineHeatmap',
    'RenewalStreams',
    'TeamSignal',
  ]) {
    assert.equal((source.match(new RegExp(`<${component}\\b`, 'g')) ?? []).length, 1, component);
  }
  assert.match(source, /order-1[^"']*lg:order-2[\s\S]*<ActionDeck/);
  assert.match(source, /order-2[^"']*lg:order-1[\s\S]*<CaseVelocityChart/);
});

test('dashboard route exposes shape-matched loading and localized safe error boundaries', () => {
  const loading = readFileSync(loadingPath, 'utf8');
  const error = readFileSync(errorPath, 'utf8');
  assert.match(loading, /rounded-3xl/);
  assert.match(loading, /Array\.from\(\{ length: 4 \}/);
  assert.match(error, /'use client'/);
  assert.match(error, /useTranslations\('pro\.dashboard\.signalStudio'\)/);
  assert.doesNotMatch(error, /error\.message/);
});

test('Signal Studio translations have complete English and Arabic route label parity', () => {
  const english = en.pro.dashboard.signalStudio;
  const arabic = ar.pro.dashboard.signalStudio;
  assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort());

  for (const key of [
    'title',
    'subtitle',
    'prioritySignals',
    'operationsScore',
    'openActionDeck',
    'assignWork',
    'activeClients',
    'openCases',
    'renewalsDue',
    'collections',
    'caseVelocity',
    'opened',
    'completed',
    'deadlineIntensity',
    'collectionsWaterfall',
    'renewalStreams',
    'teamSignal',
    'empty',
    'retry',
    'range7',
    'range30',
    'range90',
  ] as const) {
    assert.ok(key in english, `Missing en.pro.dashboard.signalStudio.${key}`);
    assert.ok(key in arabic, `Missing ar.pro.dashboard.signalStudio.${key}`);
  }
});
