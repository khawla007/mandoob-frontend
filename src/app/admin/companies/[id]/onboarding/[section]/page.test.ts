import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { parseAdminCompanyOnboardingSection } from '../route-logic';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const page = read('src/app/admin/companies/[id]/onboarding/[section]/page.tsx');
const loading = read('src/app/admin/companies/[id]/onboarding/[section]/loading.tsx');
const error = read('src/app/admin/companies/[id]/onboarding/[section]/error.tsx');
const reopen = read('src/components/admin/ReopenCompanyOnboardingForm.tsx');

test('admin section parser permits only the six fixed sections and review', () => {
  for (const section of [
    'legal',
    'shareholders',
    'activities',
    'office',
    'establishment',
    'bank',
    'review',
  ]) {
    assert.equal(parseAdminCompanyOnboardingSection(section), section);
  }
  assert.equal(parseAdminCompanyOnboardingSection('../legal'), null);
  assert.equal(parseAdminCompanyOnboardingSection('clients'), null);
});

test('every admin deep link authorizes before exact company and snapshot reads', () => {
  assert.match(page, /params: Promise<\{ id: string; section: string \}>/u);
  assert.match(page, /const \{ id, section: rawSection \} = await params/u);
  const authAt = page.indexOf('requirePlatformOperator()');
  const resolveAt = page.indexOf('getCompanyById(id)');
  const readAt = page.indexOf('readCompanyOnboarding({');
  assert.ok(authAt >= 0 && authAt < resolveAt && resolveAt < readAt);
  assert.match(page, /if \(!section\) notFound\(\)/u);
  assert.match(page, /if \(!company\) notFound\(\)/u);
  assert.match(page, /if \(!snapshot\) notFound\(\)/u);
  assert.equal((page.match(/readCompanyOnboarding\(\{/gu) ?? []).length, 1);
});

test('admin route reuses every shared masked form with operator-bound actions', () => {
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
  assert.match(page, /createAdminOnboardingActionState\(snapshot\.onboardingVersion\)/u);
  assert.match(page, /\.bind\(null, snapshot\.companyId\)/u);
  assert.match(page, /submitAdminCompanyOnboardingAction/u);
  assert.match(page, /activateAdminCompanyOnboardingAction/u);
  assert.doesNotMatch(page, /encrypted|_hash|useEffect|fetch\(/u);
});

test('operator surface exposes explicit reopen confirmation and reason', () => {
  assert.match(page, /ReopenCompanyOnboardingForm/u);
  assert.match(reopen, /^'use client';/u);
  assert.match(reopen, /companyNameConfirmation/u);
  assert.match(reopen, /expectedCompanyName/u);
  assert.match(reopen, /reason/u);
  assert.match(reopen, /reopenAdminOnboardingSectionAction/u);
  assert.match(reopen, /claimFormSubmission/u);
  assert.doesNotMatch(reopen, />\s*(Reopen|Reason|Company name|Confirm)/u);
});

test('admin loading and sanitized retry preserve shared shell geometry', () => {
  assert.match(loading, /md:grid-cols-\[14rem_minmax\(0,1fr\)\]/u);
  assert.match(loading, /animate-pulse/u);
  assert.match(error, /^'use client';/u);
  assert.match(error, /reset\(\)/u);
  assert.match(error, /useTranslations/u);
  assert.doesNotMatch(error, /error\.message|error\.stack|String\(error\)/u);
});
