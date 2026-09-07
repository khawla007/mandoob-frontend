import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin registration routes authorize directly and validate detail identity', async () => {
  const [index, detail] = await Promise.all([
    read('app/admin/registrations/page.tsx'),
    read('app/admin/registrations/[registrationId]/page.tsx'),
  ]);
  assert.match(index, /requirePlatformOperator\(\)/u);
  assert.match(index, /loadRegistrationIndex\(\)/u);
  assert.match(detail, /requirePlatformOperator\(\)/u);
  assert.match(detail, /z\.string\(\)\.uuid\(\)/u);
  assert.match(detail, /registrationId/u);
  assert.doesNotMatch(detail, /getCompanyById|company_profiles|service_cases/u);
  assert.match(index, /aria-label=\{t\('pagination\.label'\)\}/u);
  assert.match(index, /aria-disabled="true"/u);
});

test('Company detail links registration as a distinct consumed filter, not a fabricated registration identity', async () => {
  const source = await read('app/admin/companies/[id]/page.tsx');
  assert.match(source, /admin\/registrations\?company=/u);
  assert.doesNotMatch(source, /admin\/registrations\/\$\{company\.id\}/u);
});

test('Customer Company surface links the canonical read-only registration workspace', async () => {
  const source = await read('app/(tenant)/t/[tenant]/(customer)/portal/company/page.tsx');
  assert.match(source, /portal\/registration/u);
});

test('PRO registration resolves only the assigned Company and never service cases', async () => {
  const source = await read('app/(tenant)/t/[tenant]/(pro)/applications/registration/page.tsx');
  assert.match(source, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(source, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(source, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.doesNotMatch(source, /service[_-]?cases|companyId.*searchParams|CompanySelector/iu);
  for (const dimension of [
    'legal-progress',
    'onboarding-lifecycle',
    'activation-readiness',
    'operational-lifecycle',
  ]) {
    assert.match(source, new RegExp(`data-${dimension}`, 'u'));
  }
});

test('Customer registration is linked-Company read-only and independently settles live Company context', async () => {
  const source = await read('app/(tenant)/t/[tenant]/(customer)/portal/registration/page.tsx');
  assert.match(source, /authorizeCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(source, /loadCustomerCompanyDisplay\(access\)/u);
  assert.match(source, /loadRegistrationPresentation\(\)/u);
  assert.doesNotMatch(source, /<form|\saction=|createSupabaseServiceRoleClient|raw.*identifier/iu);
  for (const dimension of [
    'onboarding-lifecycle',
    'activation-readiness',
    'operational-lifecycle',
  ]) {
    assert.match(source, new RegExp(`data-${dimension}`, 'u'));
  }
});

test('Employee visa region retains own-record authorization and excludes Company stages', async () => {
  const source = await read('app/(tenant)/t/[tenant]/(employee)/employee/identity/page.tsx');
  assert.match(source, /authorizeEmployeePortalRead\(slug\)/u);
  assert.match(source, /loadVisaPresentation\(\)/u);
  assert.match(source, /VisaProcessWorkspace/u);
  assert.doesNotMatch(source, /RegistrationWorkspace|REGISTRATION_STAGE_CODES|visaPeople\.map/iu);
});

test('applications explicitly identify generic service cases separately from registration', async () => {
  const source = await read('app/(tenant)/t/[tenant]/(pro)/applications/page.tsx');
  assert.match(source, /data-service-case-workspace/u);
  assert.match(source, /applications\/registration/u);
});
