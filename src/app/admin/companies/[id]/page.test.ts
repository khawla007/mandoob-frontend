import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const page = readFileSync(join(process.cwd(), 'src/app/admin/companies/[id]/page.tsx'), 'utf8');

test('company detail authorizes before company, onboarding, and assignment reads', () => {
  const authAt = page.indexOf('requirePlatformOperator()');
  const companyAt = page.indexOf('getCompanyById(id)');
  const onboardingAt = page.indexOf('readCompanyOnboarding({');
  const assignmentAt = page.indexOf('readCurrentCompanyAssignment(company.id, operator.id)');
  assert.ok(authAt >= 0 && authAt < companyAt && companyAt < onboardingAt);
  assert.ok(companyAt < assignmentAt);
  assert.match(page, /actorProfileId: operator\.id/u);
  assert.match(page, /if \(!onboarding\) notFound\(\)/u);
});

test('company detail preserves company-aware eligibility and blocked assignment summaries', () => {
  assert.match(page, /listEligibleProsForCompany\(company\.id, '', 100, operator\.id\)/u);
  assert.match(page, /availablePros=\{eligiblePros\}/u);
  assert.doesNotMatch(page, /const availablePros = eligiblePros\.map/u);
  assert.match(page, /currentAssignment=\{currentAssignment\}/u);
});

test('company detail adds one compact onboarding panel without removing assignment history', () => {
  assert.match(page, /CompanyOnboardingAdminSummary/u);
  assert.match(page, /onboarding\.onboardingStatus/u);
  assert.match(page, /onboarding\.sectionProgress/u);
  assert.match(page, /onboarding\.requirements/u);
  assert.match(page, /currentAssignment/u);
  assert.match(page, /adminCompanyOnboardingSectionHref/u);
  assert.equal((page.match(/href=\{onboardingHref\}/gu) ?? []).length, 1);
  assert.match(page, /assignmentHistory\.map/u);
  assert.match(page, /CompanyAssignmentForm/u);
  assert.match(page, /ReleaseCompanyProForm/u);
});
