import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalCompanyOnboardingSection,
  companyOnboardingSectionHref,
  isCompanyOnboardingTenantStatusAllowed,
} from './route-logic';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/setup/page.tsx'),
  'utf8',
);

function snapshot(
  statuses: Partial<Record<keyof CompanyOnboardingSnapshot['sectionProgress'], 'complete'>> = {},
): Pick<CompanyOnboardingSnapshot, 'onboardingStatus' | 'sectionProgress'> {
  return {
    onboardingStatus: 'in_progress',
    sectionProgress: {
      legal: { status: statuses.legal ?? 'incomplete', completedAt: null },
      shareholders: { status: statuses.shareholders ?? 'incomplete', completedAt: null },
      activities: { status: statuses.activities ?? 'incomplete', completedAt: null },
      office: { status: statuses.office ?? 'incomplete', completedAt: null },
      establishment: { status: statuses.establishment ?? 'incomplete', completedAt: null },
      bank: { status: statuses.bank ?? 'incomplete', completedAt: null },
    },
  };
}

test('canonical setup resume selects the first incomplete section then review', () => {
  assert.equal(canonicalCompanyOnboardingSection(snapshot()), 'legal');
  assert.equal(
    canonicalCompanyOnboardingSection(snapshot({ legal: 'complete', shareholders: 'complete' })),
    'activities',
  );
  assert.equal(
    canonicalCompanyOnboardingSection(
      snapshot({
        legal: 'complete',
        shareholders: 'complete',
        activities: 'complete',
        office: 'complete',
        establishment: 'complete',
        bank: 'complete',
      }),
    ),
    'review',
  );
});

test('setup href encodes the tenant slug and never carries workflow or sensitive query state', () => {
  const href = companyOnboardingSectionHref('acme & co', 'bank');
  assert.equal(href, '/t/acme%20%26%20co/company/setup/bank');
  assert.doesNotMatch(href, /\?|token|success|error|iban|account/iu);
});

test('setup accepts pre-activation workspace states but denies suspended or unknown states', () => {
  assert.equal(isCompanyOnboardingTenantStatusAllowed('pending'), true);
  assert.equal(isCompanyOnboardingTenantStatusAllowed('unassigned'), true);
  assert.equal(isCompanyOnboardingTenantStatusAllowed('active'), true);
  assert.equal(isCompanyOnboardingTenantStatusAllowed('suspended'), false);
  assert.equal(isCompanyOnboardingTenantStatusAllowed('deleted'), false);
});

test('setup index authorizes and rejects inactive tenants before scoped service-role reads', () => {
  const authAt = source.indexOf('requireProTenantRouteAccess(slug)');
  const activeAt = source.indexOf('isCompanyOnboardingTenantStatusAllowed(tenant.status)');
  const companyAt = source.indexOf('readAssignedCompanyForPro(session.id, slug)');
  const snapshotAt = source.indexOf('readCompanyOnboarding({');
  assert.ok(authAt >= 0 && authAt < activeAt);
  assert.ok(activeAt < companyAt && companyAt < snapshotAt);
  assert.match(
    source,
    /if \(!isCompanyOnboardingTenantStatusAllowed\(tenant\.status\)\) notFound\(\)/u,
  );
  assert.match(source, /if \(!company\) notFound\(\)/u);
  assert.match(source, /actorProfileId: session\.id/u);
  assert.match(source, /tenantId: tenant\.id/u);
  assert.match(source, /companyId: company\.id/u);
});

test('setup index redirects only to the computed canonical section', () => {
  assert.match(source, /canonicalCompanyOnboardingSection\(snapshot\)/u);
  assert.match(source, /redirect\(companyOnboardingSectionHref\(slug, section\)\)/u);
  assert.doesNotMatch(source, /searchParams|localStorage|sessionStorage|useEffect/u);
});
