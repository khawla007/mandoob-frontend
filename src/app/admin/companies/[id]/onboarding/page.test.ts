import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  adminCompanyOnboardingSectionHref,
  canonicalAdminCompanyOnboardingSection,
} from './route-logic';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';

const source = readFileSync(
  join(process.cwd(), 'src/app/admin/companies/[id]/onboarding/page.tsx'),
  'utf8',
);

const progress = (completed: string[] = []): CompanyOnboardingSnapshot['sectionProgress'] =>
  Object.fromEntries(
    ['legal', 'shareholders', 'activities', 'office', 'establishment', 'bank'].map((section) => [
      section,
      { status: completed.includes(section) ? 'complete' : 'incomplete', completedAt: null },
    ]),
  ) as CompanyOnboardingSnapshot['sectionProgress'];

test('admin onboarding index resumes the earliest incomplete section then review', () => {
  assert.equal(canonicalAdminCompanyOnboardingSection({ sectionProgress: progress() }), 'legal');
  assert.equal(
    canonicalAdminCompanyOnboardingSection({
      sectionProgress: progress(['legal', 'shareholders', 'activities']),
    }),
    'office',
  );
  assert.equal(
    canonicalAdminCompanyOnboardingSection({
      sectionProgress: progress([
        'legal',
        'shareholders',
        'activities',
        'office',
        'establishment',
        'bank',
      ]),
    }),
    'review',
  );
});

test('admin href uses an encoded exact company identifier with no query state', () => {
  const href = adminCompanyOnboardingSectionHref('company id', 'review');
  assert.equal(href, '/admin/companies/company%20id/onboarding/review');
  assert.doesNotMatch(href, /\?|token|success|error/iu);
});

test('admin index authorizes before company resolution and scoped onboarding read', () => {
  const authAt = source.indexOf('requirePlatformOperator()');
  const resolveAt = source.indexOf('getCompanyById(id)');
  const readAt = source.indexOf('readCompanyOnboarding({');
  assert.ok(authAt >= 0 && authAt < resolveAt && resolveAt < readAt);
  assert.match(source, /const operator = await requirePlatformOperator\(\)/u);
  assert.match(source, /idSchema\.safeParse\(id\)/u);
  assert.match(source, /if \(!company\) notFound\(\)/u);
  assert.match(source, /actorProfileId: operator\.id/u);
  assert.match(source, /tenantId: company\.tenantId/u);
  assert.match(source, /companyId: company\.id/u);
});

test('admin index redirects only to its canonical section', () => {
  assert.match(source, /canonicalAdminCompanyOnboardingSection\(snapshot\)/u);
  assert.match(source, /redirect\(adminCompanyOnboardingSectionHref\(company\.id, section\)\)/u);
  assert.doesNotMatch(source, /searchParams|URLSearchParams|localStorage/u);
});
