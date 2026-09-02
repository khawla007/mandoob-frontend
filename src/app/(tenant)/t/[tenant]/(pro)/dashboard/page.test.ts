import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { authorizeProDashboardRead } from './page-authorization';
import {
  dashboardWidgetState,
  parseDashboardFilters,
  parseDashboardRange,
  resolveDashboardFilterState,
} from './page-logic';

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

test('dashboard filters reject repeated/malformed service values', () => {
  assert.deepEqual(parseDashboardFilters({ serviceType: 'Golden visa' }), {
    filters: { serviceType: 'Golden visa' },
    invalid: false,
  });
  assert.deepEqual(parseDashboardFilters({ serviceType: ['x', 'y'] }), {
    filters: {},
    invalid: true,
  });
  assert.deepEqual(parseDashboardFilters({ serviceType: 'xx' }), {
    filters: { serviceType: 'xx' },
    invalid: false,
  });
});

test('dashboard renders only tenant-normalized filters and reports rejected input', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(
    source,
    /getProDashboardData\(\s*tenant\.id,\s*company\.id,\s*range,\s*requestedFilters\.filters,?\s*\)/,
  );
  assert.match(source, /resolveDashboardFilterState/);
  assert.match(source, /dashboard\.errors\.operations !== undefined/);
  assert.match(source, /filters\.invalidNotice/);
  assert.match(source, /filters\.pendingNotice/);
});

test('dashboard preserves syntactically valid filter intent while operations validation is unavailable', () => {
  const requested = {
    filters: {
      serviceType: 'Golden visa',
    },
    invalid: false,
  };
  assert.deepEqual(resolveDashboardFilterState(requested, {}, true), {
    filters: requested.filters,
    notice: 'pending',
  });
  assert.deepEqual(resolveDashboardFilterState(requested, {}, false), {
    filters: {},
    notice: 'invalid',
  });
  assert.deepEqual(resolveDashboardFilterState(requested, requested.filters, false), {
    filters: requested.filters,
  });
  assert.deepEqual(resolveDashboardFilterState({ filters: {}, invalid: false }, {}, true), {
    filters: {},
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

test('dashboard page resolves the assigned company before its scoped read and has no legacy reads', () => {
  const source = readFileSync(pagePath, 'utf8');
  const metrics = readFileSync(metricsPath, 'utf8');

  assert.match(source, /params:\s*Promise<\{ tenant: string \}>/);
  assert.match(source, /searchParams:\s*Promise</);
  assert.match(source, /await Promise\.all\(\[params, searchParams\]\)/);
  const tenantAccess = source.indexOf('requireProTenantRouteAccess(slug)');
  const companyAccess = source.indexOf('readAssignedCompanyForPro(session.id, slug)');
  const dashboardRead = source.indexOf('getProDashboardData(');
  assert.ok(tenantAccess >= 0);
  assert.ok(companyAccess > tenantAccess);
  assert.ok(dashboardRead > companyAccess);
  assert.doesNotMatch(source, /SignupsChart|RecentLoginsTable|getProDashboardMetrics/);
  assert.doesNotMatch(metrics, /ProDashboardKpiKey|ProDashboardMetric|getProDashboardMetrics/);
  assert.doesNotMatch(source, /allBranches|branchUnavailable|name="owner"/u);
});

test('dashboard has one responsive composition and moves Action Deck before charts below lg', () => {
  const source = readFileSync(pagePath, 'utf8');
  for (const component of [
    'CompanyCommand',
    'CompanySummaryDeck',
    'CaseVelocityChart',
    'CollectionsWaterfall',
    'ActionDeck',
    'DeadlineHeatmap',
    'RenewalStreams',
    'PendingDocuments',
  ]) {
    assert.equal((source.match(new RegExp(`<${component}\\b`, 'g')) ?? []).length, 1, component);
  }
  assert.match(source, /order-1[^"']*lg:order-2[\s\S]*<ActionDeck/);
  assert.match(source, /order-2[^"']*lg:order-1[\s\S]*<CaseVelocityChart/);
});

test('dashboard composes a one-Company command surface without team, score, or owner controls', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /<CompanyCommand\b/u);
  assert.match(source, /<CompanySummaryDeck\b/u);
  assert.match(source, /<PendingDocuments\b/u);
  assert.match(source, /<DashboardUnavailablePanel\b/u);
  assert.doesNotMatch(source, /SignalHero|TeamSignal|canViewTeam|TeamSignalLabels/u);
  assert.doesNotMatch(source, /name="owner"|filters\.owner|allOwners/u);
  assert.doesNotMatch(source, /operationsScore|health|workloadBalance|assignWork/u);
});

test('dashboard labels its snapshot as generated and keeps registration, activity, and notifications truthful', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /t\('generatedAt'/u);
  assert.doesNotMatch(source, /t\('live'\)/u);
  assert.match(source, /registrationUnavailable/u);
  assert.match(source, /activityUnavailable/u);
  assert.match(source, /notificationsUnavailable/u);
  assert.doesNotMatch(source, /notificationCount|unreadCount|viewAllNotifications/u);
});

test('dashboard keeps readiness, lifecycle, and registration as distinct concepts', () => {
  const source = readFileSync(pagePath, 'utf8');
  const command = readFileSync(
    join(process.cwd(), 'src/components/pro/dashboard/CompanyCommand.tsx'),
    'utf8',
  );
  assert.match(source, /company\.onboardingStatus/u);
  assert.match(command, /company\.readinessCodes/u);
  assert.match(source, /company\.status/u);
  assert.match(source, /registrationUnavailable/u);
  assert.doesNotMatch(source, /registrationPercent|registrationProgress:\s*company/u);
  assert.deepEqual(en.pro.dashboard.signalStudio.registration.stages, [
    'Application Submitted',
    'Initial Approval',
    'Name Reservation',
    'License Issuance',
    'Visa Processing',
    'Bank Account',
    'Completed',
  ]);
});

test('dashboard uses the compact asymmetric Signal Studio composition', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /className="signal-dashboard/);
  assert.match(source, /className="signal-dashboard__masthead/);
  assert.match(source, /className="signal-dashboard__heading/);
  assert.match(source, /className="signal-dashboard__filters/);
  assert.match(source, /className="signal-dashboard__layout/);
  assert.match(source, /className="signal-dashboard__operations/);
  assert.match(source, /className="signal-dashboard__rail/);
});

test('dashboard keeps functional filters in a compact disclosure instead of a large permanent card', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /<details className="signal-dashboard__filter-drawer/);
  assert.match(source, /<summary[^>]*>\{t\('filters\.toggle'\)\}<\/summary>/);
  assert.match(source, /<form[\s\S]*className="signal-dashboard__filters/);
});

test('dashboard passes normalized service filters to application drilldown widgets', () => {
  const source = readFileSync(pagePath, 'utf8');
  for (const component of ['ActionDeck', 'DeadlineHeatmap']) {
    assert.match(source, new RegExp(`<${component}[\\s\\S]{0,900}filters,`), component);
  }
});

test('dashboard route exposes shape-matched loading and localized safe error boundaries', () => {
  const loading = readFileSync(loadingPath, 'utf8');
  const error = readFileSync(errorPath, 'utf8');
  assert.match(loading, /signal-dashboard/);
  assert.match(loading, /signal-dashboard__masthead/);
  assert.match(loading, /signal-dashboard__layout/);
  assert.match(loading, /rounded-2xl/);
  assert.match(loading, /Array\.from\(\{ length: 4 \}/);
  assert.match(loading, /flex-col/);
  assert.match(loading, /sm:flex-row/);
  assert.match(loading, /max-w-full/);
  assert.match(error, /'use client'/);
  assert.match(error, /useTranslations\('pro\.dashboard\.signalStudio'\)/);
  assert.match(error, /signal-dashboard__state/);
  assert.doesNotMatch(error, /error\.message/);
});

test('Signal Studio translations have complete English and Arabic route label parity', () => {
  const english = en.pro.dashboard.signalStudio;
  const arabic = ar.pro.dashboard.signalStudio;
  assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort());

  for (const key of [
    'title',
    'subtitle',
    'generatedAt',
    'priorityActions',
    'caseVelocity',
    'opened',
    'completed',
    'deadlineIntensity',
    'collectionsWaterfall',
    'renewalStreams',
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

test('dashboard reads parameterized widget labels as raw templates', () => {
  const source = readFileSync(pagePath, 'utf8');
  const templateKeys = [
    'companyCommand.profileSections',
    'caseVelocityLabels.summary',
    'collectionsLabels.barLabel',
    'collectionsLabels.summary',
    'actionLabels.actionAria',
    'actionLabels.absoluteDeadline',
    'actionLabels.countdown.minutes',
    'actionLabels.countdown.hours',
    'actionLabels.countdown.days',
    'deadlineLabels.cellLabel',
    'deadlineLabels.eventLink',
    'deadlineLabels.documentLink',
  ];

  for (const key of templateKeys) {
    assert.ok(source.includes(`t.raw('${key}')`), key);
    assert.ok(!source.includes(`t('${key}')`), key);
  }
});

test('dashboard range controls keep inactive labels above minimum contrast', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /'text-foreground\/70 hover:text-foreground'/);
  assert.doesNotMatch(source, /'text-muted-foreground hover:text-foreground'/);
});
