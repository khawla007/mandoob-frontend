import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { COMPANY_ONBOARDING_READINESS_CODES } from '@/lib/company-onboarding/contracts';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { CompanyPanelState } from '@/lib/data/company-workspace';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('AssignedCompanyOverview render contracts run under the client React export condition', () => {
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

const labels = {
  unavailableTitle: 'Legal profile unavailable',
  unavailableDescription: 'Documents remain available.',
  emptyValue: 'Not provided',
  legalCompleteness: 'Legal completeness',
  activationReadiness: 'Activation readiness',
  lifecycle: 'Company lifecycle',
  lifecycleValue: 'Active company',
  sectionsComplete: '6 of 6 sections complete',
  activationReady: 'Ready for activation',
  activationBlocked: 'Activation blocked',
  primaryActivity: 'Primary',
  additionalActivity: 'Additional',
  openSection: 'Open setup section',
  sectionStatuses: { complete: 'Complete', incomplete: 'Incomplete' },
  sections: {
    legal: 'Legal profile',
    shareholders: 'Shareholders',
    activities: 'Activities',
    office: 'Office',
    establishment: 'Establishment',
    bank: 'Bank',
  },
  fields: {
    registeredName: 'Registered name',
    displayName: 'Display name',
    jurisdictionType: 'Jurisdiction type',
    licensingAuthority: 'Licensing authority',
    legalStructure: 'Legal structure',
    tradeLicense: 'Trade license',
    licenseExpiry: 'License expiry',
    shareholderType: 'Type',
    nationality: 'Nationality',
    incorporationCountry: 'Country',
    registrationNumber: 'Registration number',
    ownershipPercent: 'Ownership',
    activityCode: 'Activity code',
    authorityName: 'Authority',
    officeType: 'Office type',
    address: 'Address',
    providerName: 'Provider',
    leaseReference: 'Lease reference',
    leaseExpiry: 'Lease expiry',
    establishmentCard: 'Establishment card',
    establishmentExpiry: 'Establishment expiry',
    bankName: 'Bank name',
    branchName: 'Branch',
    accountHolderName: 'Account holder',
    currency: 'Currency',
    iban: 'IBAN',
    accountNumber: 'Account number',
  },
  jurisdictions: { mainland: 'Mainland', free_zone: 'Free zone', offshore: 'Offshore' },
  officeTypes: { physical: 'Physical', flexi_desk: 'Flexi desk', virtual: 'Virtual' },
  shareholderKinds: { individual: 'Individual', company: 'Company' },
  requirements: Object.fromEntries(
    COMPANY_ONBOARDING_READINESS_CODES.map((code) => [code, code]),
  ) as Record<(typeof COMPANY_ONBOARDING_READINESS_CODES)[number], string>,
};

const sectionHrefs = {
  legal: '/t/acme/company/setup/legal',
  shareholders: '/t/acme/company/setup/shareholders',
  activities: '/t/acme/company/setup/activities',
  office: '/t/acme/company/setup/office',
  establishment: '/t/acme/company/setup/establishment',
  bank: '/t/acme/company/setup/bank',
  assignment: '/t/acme/company/setup/review',
  workspace: '/t/acme/company/setup/review',
};

async function render(profile: CompanyPanelState<CompanyOnboardingSnapshot>): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { AssignedCompanyOverview } = await import('./AssignedCompanyOverview');
  return renderToStaticMarkup(
    React.createElement(AssignedCompanyOverview, {
      company,
      profile,
      locale: 'en-US',
      dateFormatter: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }),
      sectionHrefs,
      labels,
    }),
  );
}

renderTest(
  'legal-profile unavailability is localized and does not erase the Company workspace',
  async () => {
    const html = await render({ status: 'error' });
    assert.match(html, /Legal profile unavailable/u);
    assert.match(html, /Documents remain available\./u);
    assert.doesNotMatch(html, /private rpc detail|Acme Trading LLC/u);
  },
);

renderTest(
  'detailed legal overview renders lifecycle from Company status and canonical setup links',
  async () => {
    const snapshot: CompanyOnboardingSnapshot = {
      companyId: company.id,
      tenantId: company.tenantId,
      companyName: company.companyName,
      displayName: null,
      companyStatus: company.status,
      jurisdictionType: 'mainland',
      licensingAuthority: 'Dubai Mainland',
      legalStructure: 'LLC',
      tradeLicenseNo: 'DED-123456',
      licenseExpiry: '2027-08-17',
      establishmentCardMasked: '•••• 1234',
      establishmentCardExpiry: '2027-08-17',
      onboardingStatus: 'completed',
      onboardingVersion: 4,
      shareholders: [],
      activities: [],
      office: null,
      bank: null,
      sectionProgress: Object.fromEntries(
        Object.keys(company.sectionProgress).map((section) => [
          section,
          { status: 'complete', completedAt: '2026-08-17T10:00:00.000Z' },
        ]),
      ) as CompanyOnboardingSnapshot['sectionProgress'],
      requirements: [],
    };
    const html = await render({ status: 'ready', data: snapshot });
    assert.match(html, /Company lifecycle/u);
    assert.match(html, /Active company/u);
    assert.doesNotMatch(html, /Completed onboarding/u);
    for (const href of Object.values(sectionHrefs).slice(0, 6))
      assert.match(html, new RegExp(href));
  },
);
