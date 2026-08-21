import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { companyOnboardingSectionHref, parseCompanyOnboardingSection } from '../route-logic';

const root = process.cwd();
const page = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/setup/[section]/page.tsx'),
  'utf8',
);
const loading = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/setup/[section]/loading.tsx'),
  'utf8',
);
const error = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/setup/[section]/error.tsx'),
  'utf8',
);

test('fixed section parser accepts six sections plus review and rejects all other slugs', () => {
  for (const section of [
    'legal',
    'shareholders',
    'activities',
    'office',
    'establishment',
    'bank',
    'review',
  ]) {
    assert.equal(parseCompanyOnboardingSection(section), section);
  }
  assert.equal(parseCompanyOnboardingSection('legal/../bank'), null);
  assert.equal(parseCompanyOnboardingSection('clients'), null);
  assert.equal(parseCompanyOnboardingSection(''), null);
});

test('section page awaits params, authorizes before reads, and fails closed for stale access', () => {
  assert.match(page, /params: Promise<\{ tenant: string; section: string \}>/u);
  assert.match(page, /const \{ tenant: slug, section: rawSection \} = await params/u);
  const authAt = page.indexOf('requireProTenantRouteAccess(slug)');
  const activeAt = page.indexOf('isCompanyOnboardingTenantStatusAllowed(tenant.status)');
  const companyAt = page.indexOf('readAssignedCompanyForPro(session.id, slug)');
  const readAt = page.indexOf('readCompanyOnboarding({');
  assert.ok(authAt >= 0 && authAt < activeAt);
  assert.ok(activeAt < companyAt && companyAt < readAt);
  assert.match(page, /if \(!section\) notFound\(\)/u);
  assert.match(page, /if \(!company\) notFound\(\)/u);
  assert.match(page, /if \(!snapshot\) notFound\(\)/u);
});

test('section page uses one snapshot version and server-bound actions for every form', () => {
  assert.equal((page.match(/readCompanyOnboarding\(\{/gu) ?? []).length, 1);
  assert.match(page, /createOnboardingActionState\(snapshot\.onboardingVersion\)/u);
  for (const component of [
    'LegalProfileForm',
    'ShareholdersForm',
    'ActivitiesForm',
    'OfficeDetailsForm',
    'EstablishmentCardForm',
    'BankDetailsForm',
    'OnboardingReview',
  ]) {
    assert.match(page, new RegExp(`<${component}\\b`, 'u'));
  }
  assert.match(page, /\.bind\(null, slug, snapshot\.companyId\)/u);
  assert.doesNotMatch(page, /useEffect|fetch\(|localStorage|sessionStorage/u);
});

test('deep links remain on the requested valid section and step links have no query state', () => {
  assert.match(page, /buildCompanyOnboardingSteps\(slug, snapshot, section/u);
  assert.equal(companyOnboardingSectionHref('acme', 'review'), '/t/acme/company/setup/review');
  assert.doesNotMatch(
    page,
    /redirect\([^\n]*(?:success|error|token)|URLSearchParams|searchParams/u,
  );
});

test('review renders localized blockers and distinct submit or activation actions', () => {
  assert.match(page, /submitCompanyOnboardingAction/u);
  assert.match(page, /activateCompanyOnboardingAction/u);
  assert.match(page, /sectionHrefs=/u);
  assert.match(page, /requirements:/u);
});

test('bank save and destructive clear controls receive independent operation receipts', () => {
  assert.match(page, /const clearBankInitialState = createOnboardingActionState/u);
  assert.match(page, /clearInitialState=\{clearBankInitialState\}/u);
});

test('loading and error boundaries preserve shell geometry and expose sanitized retry', () => {
  assert.match(loading, /md:grid-cols-\[14rem_minmax\(0,1fr\)\]/u);
  assert.match(loading, /animate-pulse/u);
  assert.match(error, /^'use client';/u);
  assert.match(error, /reset\(\)/u);
  assert.match(error, /getTranslations|useTranslations/u);
  assert.doesNotMatch(error, /error\.message|error\.stack|String\(error\)/u);
});
