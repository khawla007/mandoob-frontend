import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import type { CompanySummaryDeckLabels } from './CompanySummaryDeck';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('CompanySummaryDeck render contracts run under the client React export condition', () => {
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
        env: childEnvironment,
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

const company: AssignedCompanyProfile = {
  id: '33333333-3333-4333-8333-333333333333',
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyName: 'Acme Trading LLC',
  status: 'active',
  jurisdiction: 'Dubai Mainland',
  tradeLicenseNo: 'DED-123456',
  licenseExpiry: '2027-08-17',
  shareholderCount: 1,
  registeredActivityCount: 1,
  onboardingStatus: 'in_progress',
  onboardingVersion: 4,
  sectionProgress: {
    legal: 'incomplete',
    shareholders: 'incomplete',
    activities: 'incomplete',
    office: 'incomplete',
    establishment: 'incomplete',
    bank: 'incomplete',
  },
  readinessCodes: [
    'LEGAL_SECTION_INCOMPLETE',
    'SHAREHOLDERS_SECTION_INCOMPLETE',
    'ACTIVITIES_SECTION_INCOMPLETE',
    'OFFICE_SECTION_INCOMPLETE',
    'ESTABLISHMENT_SECTION_INCOMPLETE',
    'BANK_SECTION_INCOMPLETE',
  ],
  readinessState: 'data',
  createdAt: '2026-08-17T10:00:00.000Z',
  updatedAt: '2026-08-17T10:00:00.000Z',
};

const dashboard: ProDashboardData = {
  generatedAt: '2026-09-15T08:00:00.000Z',
  totalPrioritySignals: 0,
  kpis: {
    activeCompany: 1,
    openCases: 0,
    movingCases: 0,
    blockedCases: 0,
    renewalsDue30d: 0,
    renewalsDue7d: 0,
    collectedMinor: 0,
    currency: 'AED',
    collectionRate: 0,
  },
  caseVelocity: [],
  actionDeck: [],
  deadlineIntensity: [],
  deadlineEvents: [],
  finance: {
    billedMinor: 0,
    paidMinor: 0,
    dueSoonMinor: 0,
    overdueMinor: 0,
    currency: 'AED',
  },
  renewalStreams: {
    license: { d7: 0, d30: 0, d60: 0, d90: 0 },
    visa: { d7: 0, d30: 0, d60: 0, d90: 0 },
    eid: { d7: 0, d30: 0, d60: 0, d90: 0 },
    ejari: { d7: 0, d30: 0, d60: 0, d90: 0 },
  },
  pendingDocuments: [],
  filterOptions: { serviceTypes: [] },
  appliedFilters: {},
  filtersRejected: false,
  errors: {},
};

const labels: CompanySummaryDeckLabels = {
  readiness: 'Readiness',
  ready: 'Ready',
  actionRequired: 'Action required',
  unavailable: 'Unavailable',
  documents: 'Documents',
  renewals: 'Renewals',
  renewalsPeriod: 'Due within 30 days',
  invoices: 'Invoices',
  outstanding: 'Outstanding',
};

type SummaryOverrides = {
  company?: AssignedCompanyProfile | null;
  dashboard?: ProDashboardData;
  states?: Parameters<typeof import('./CompanySummaryDeck').CompanySummaryDeck>[0]['states'];
};

async function render(overrides: SummaryOverrides = {}): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CompanySummaryDeck } = await import('./CompanySummaryDeck');
  return renderToStaticMarkup(
    React.createElement(CompanySummaryDeck, {
      company,
      dashboard,
      tenantSlug: 'acme workspace',
      locale: 'en-US',
      labels,
      ...overrides,
    }),
  );
}

function linkedCard(html: string, href: string): string {
  const match = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)].find(
    ([, candidate]) => candidate === href,
  );
  assert.ok(match, `Missing card link: ${href}`);
  return match[2];
}

renderTest(
  'healthy all-zero signals render four truthful links without fabricated marks',
  async () => {
    const html = await render();
    const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/gu)].map(([, href]) => href);
    assert.deepEqual(hrefs, [
      '/t/acme%20workspace/company',
      '/t/acme%20workspace/documents',
      '/t/acme%20workspace/renewals?tab=active&amp;days=30',
      '/t/acme%20workspace/payments?view=overdue',
    ]);
    assert.match(linkedCard(html, hrefs[0]), /Action required/u);
    assert.match(linkedCard(html, hrefs[1]), /<strong[^>]*>0<\/strong>/u);
    assert.match(linkedCard(html, hrefs[2]), /<strong[^>]*>0<\/strong>/u);
    assert.match(linkedCard(html, hrefs[3]), /<strong[^>]*>AED(?:\u00a0| )0<\/strong>/u);
    assert.doesNotMatch(html, /signal-kpi__bars|<i\b/u);
  },
);

renderTest(
  'one failed source hides its value and bars while healthy siblings remain truthful',
  async () => {
    const html = await render({
      company: {
        ...company,
        sectionProgress: { ...company.sectionProgress, legal: 'complete' },
      },
      dashboard: {
        ...dashboard,
        kpis: { ...dashboard.kpis, renewalsDue7d: 2, renewalsDue30d: 5 },
        finance: { ...dashboard.finance, dueSoonMinor: 300 },
        pendingDocuments: [
          {
            id: 'document-1',
            label: 'Passport',
            state: 'awaiting-upload',
            deadline: null,
            href: '/documents/document-1',
          },
          {
            id: 'document-2',
            label: 'Licence',
            state: 'review-pending',
            deadline: null,
            href: '/documents/document-2',
          },
        ],
      },
      states: { renewals: { kind: 'error', message: 'Renewals temporarily unavailable' } },
    });
    const documents = linkedCard(html, '/t/acme%20workspace/documents');
    const renewals = linkedCard(html, '/t/acme%20workspace/renewals?tab=active&amp;days=30');
    const finance = linkedCard(html, '/t/acme%20workspace/payments?view=overdue');

    assert.match(documents, /<strong[^>]*>2<\/strong>/u);
    assert.equal((documents.match(/<i style="height:100%;min-height:0"><\/i>/gu) ?? []).length, 2);
    assert.match(renewals, /Unavailable/u);
    assert.match(renewals, /Renewals temporarily unavailable/u);
    assert.doesNotMatch(renewals, /signal-kpi__bars|<i\b|<strong[^>]*>5<\/strong>/u);
    assert.match(finance, /<strong[^>]*>AED(?:\u00a0| )3<\/strong>/u);
  },
);
