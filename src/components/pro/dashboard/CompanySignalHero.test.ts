import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';

import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

import type { CompanySignalHeroProps } from './CompanySignalHero';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('CompanySignalHero render contracts run under the client React export condition', () => {
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
  onboardingStatus: 'completed',
  onboardingVersion: 4,
  sectionProgress: {
    legal: 'complete',
    shareholders: 'complete',
    activities: 'complete',
    office: 'complete',
    establishment: 'complete',
    bank: 'complete',
  },
  readinessCodes: [],
  readinessState: 'data',
  createdAt: '2026-08-17T10:00:00.000Z',
  updatedAt: '2026-08-17T10:00:00.000Z',
};

const dashboard: Pick<ProDashboardData, 'totalPrioritySignals' | 'caseVelocity'> = {
  totalPrioritySignals: 37,
  caseVelocity: [{ date: '2026-09-15', opened: 9, completed: 4 }],
};

const labels = {
  companyFallback: 'Assigned Company',
  prioritySignals: 'Priority signals',
  actionSummary: 'actions need attention',
  openActionDeck: 'Open action deck',
  openCompany: 'Open Company',
  activationReadiness: 'Activation readiness',
  ready: 'Ready for activation',
  actionRequired: 'Action required',
  unavailable: 'Unavailable',
  registration: 'Authority registration',
  registrationUnavailable: 'Registration unavailable',
  velocityAria: '{opened} opened, {completed} completed over {days} days',
  velocityUnavailable: 'Case velocity unavailable',
  lifecycle: 'Company lifecycle',
  lifecycleValue: 'Active',
  jurisdiction: 'Jurisdiction',
  licenceExpiry: 'Licence expiry',
  licenceMissing: 'Not recorded',
  legalProfile: 'Legal profile',
  onboardingValue: 'Completed',
  profileSections: '{complete} of {total} legal sections complete',
  readinessItems: 'Readiness items: {count}',
};

renderTest('Company hero availability labels have English and Arabic parity', () => {
  const english = en.pro.dashboard.signalStudio.hero;
  const arabic = ar.pro.dashboard.signalStudio.hero;
  assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort());
  for (const key of ['unavailable', 'velocityUnavailable'] as const) {
    assert.ok(key in english, `Missing English Company hero label: ${key}`);
    assert.ok(key in arabic, `Missing Arabic Company hero label: ${key}`);
  }
});

type HeroOverrides = Partial<
  Pick<
    CompanySignalHeroProps,
    | 'company'
    | 'dashboard'
    | 'readinessAvailable'
    | 'priorityAvailable'
    | 'velocityAvailable'
    | 'locale'
    | 'labels'
  >
>;

async function render(overrides: HeroOverrides = {}): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CompanySignalHero } = await import('./CompanySignalHero');
  const props: CompanySignalHeroProps = {
    company,
    dashboard,
    tenantSlug: 'acme',
    locale: 'en-US',
    filters: { serviceType: 'renewal' },
    readinessAvailable: true,
    priorityAvailable: true,
    velocityAvailable: true,
    labels,
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(CompanySignalHero, props));
}

renderTest('null Company reports readiness as unavailable', async () => {
  const html = await render({ company: null });
  assert.match(html, /Activation readiness: Unavailable/u);
  assert.doesNotMatch(html, /Activation readiness: Action required/u);
});

renderTest('failed readiness source reports unavailable', async () => {
  const html = await render({ readinessAvailable: false });
  assert.match(html, /Activation readiness: Unavailable/u);
});

renderTest('authoritative readiness with zero codes reports ready', async () => {
  const html = await render();
  assert.match(html, /Activation readiness: Ready for activation/u);
});

renderTest('authoritative readiness with codes reports action required', async () => {
  const html = await render({
    company: { ...company, readinessCodes: ['TRADE_LICENSE_MISSING'] },
  });
  assert.match(html, /Activation readiness: Action required/u);
});

renderTest('unavailable priority source suppresses numeric priority claims', async () => {
  const html = await render({ priorityAvailable: false });
  assert.match(html, /Priority signals: Unavailable<\/p>/u);
  assert.match(html, /<dt class="sr-only">Priority signals<\/dt><dd>Unavailable<\/dd>/u);
  assert.doesNotMatch(html, /37 Priority signals|37 actions need attention/u);
});

renderTest('unavailable velocity source suppresses its SVG and numeric aria claim', async () => {
  const html = await render({ velocityAvailable: false });
  assert.match(html, /Acme Trading LLC/u);
  assert.match(html, /Activation readiness: Ready for activation/u);
  assert.match(html, /Case velocity unavailable/u);
  assert.doesNotMatch(html, /<svg|role="img"|9 opened, 4 completed/u);
});

renderTest('empty available velocity remains accessible without empty data shapes', async () => {
  const html = await render({ dashboard: { ...dashboard, caseVelocity: [] } });
  assert.match(html, /role="img"/u);
  assert.match(html, /aria-label="0 opened, 0 completed over 0 days"/u);
  assert.match(html, /<svg/u);
  assert.doesNotMatch(html, /<polygon|<polyline/u);
});

renderTest(
  'compact hero retains all Company facts independently of authority registration',
  async () => {
    const html = await render({
      company: { ...company, readinessCodes: ['TRADE_LICENSE_MISSING'] },
    });
    assert.match(html, /<h2[^>]*>Acme Trading LLC<\/h2>/u);
    assert.doesNotMatch(html, /<h1|<h3/u);
    assert.match(html, /<dt>Company lifecycle<\/dt><dd>Active<\/dd>/u);
    assert.match(html, /<dt>Jurisdiction<\/dt><dd>Dubai Mainland<\/dd>/u);
    assert.match(html, /<dt>Licence expiry<\/dt><dd>Aug 17, 2027<\/dd>/u);
    assert.match(html, /<dt>Legal profile<\/dt><dd>Completed/u);
    assert.match(html, /6 of 6 legal sections complete/u);
    assert.match(html, /Activation readiness: Action required/u);
    assert.match(html, /Readiness items: 1/u);
    assert.match(html, /<dt>Authority registration<\/dt><dd>Registration unavailable<\/dd>/u);
    assert.doesNotMatch(html, /registrationPercent|progressbar|LIVE/u);
  },
);

renderTest('hero formats real section completion and UAE licence date for Arabic', async () => {
  const html = await render({
    locale: 'ar',
    company: { ...company, sectionProgress: { ...company.sectionProgress, legal: 'incomplete' } },
  });
  const date = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  assert.ok(html.includes(date.format(new Date('2027-08-17T00:00:00+04:00'))));
  const number = new Intl.NumberFormat('ar');
  assert.ok(html.includes(`${number.format(5)} of ${number.format(6)} legal sections complete`));
});

renderTest(
  'missing Company fields and unavailable sources never fabricate completion or blockers',
  async () => {
    const missing = await render({
      company: { ...company, jurisdiction: null, licenseExpiry: null },
    });
    assert.match(missing, /<dt>Jurisdiction<\/dt><dd>Not recorded<\/dd>/u);
    assert.match(missing, /<dt>Licence expiry<\/dt><dd>Not recorded<\/dd>/u);
    const unavailable = await render({ readinessAvailable: false });
    assert.doesNotMatch(unavailable, /Readiness items: 0/u);
    const absent = await render({ company: null });
    assert.match(absent, /<dt>Legal profile<\/dt><dd>Unavailable<\/dd>/u);
    assert.doesNotMatch(absent, /0 of 0|6 of 6|Readiness items: 0/u);
  },
);
