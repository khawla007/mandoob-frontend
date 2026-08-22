import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

test('generic PRO edit UI renders a masked lifecycle summary without legacy verification control', () => {
  const panel = read('src/components/admin/EditUserPanel.tsx');
  assert.match(panel, /credentialSummary/u);
  assert.match(panel, /maskedIdentifier/u);
  assert.doesNotMatch(panel, /VerifyProCredentialsButton|credentialsVerified|verifiedAt/u);
});

test('generic admin workflow has no legacy credential verification runtime path', () => {
  assert.equal(existsSync('src/components/admin/VerifyProCredentialsButton.tsx'), false);
  assert.equal(existsSync('src/lib/data/pro-credential-verification.ts'), false);
  assert.equal(existsSync('src/app/api/v1/admin/users/[id]/credentials/route.ts'), false);
});

test('role conversion gives admin and super_admin the same business-role choices and keeps PRO tenantless', () => {
  const panel = read('src/components/admin/ChangeRolePanel.tsx');
  assert.doesNotMatch(panel, /callerRole/u);
  assert.doesNotMatch(panel, /callerRole === 'super_admin'[\s\S]*ALL_NEW_ROLES\.filter/u);
  assert.match(panel, /newRole !== 'admin' && newRole !== 'pro'/u);
  assert.match(panel, /newRole === 'pro'[\s\S]*tenant_id[^\n]*null/u);
});

test('all company mutation forms use the real duplicate-submission latch', () => {
  for (const file of [
    'CreateCompanyForm.tsx',
    'CompanyAssignmentForm.tsx',
    'ReleaseCompanyProForm.tsx',
  ]) {
    const source = read(`src/components/admin/${file}`);
    assert.match(source, /claimFormSubmission/u, file);
    assert.match(source, /preventDefault/u, file);
    assert.match(source, /completed=\{state\?\.ok/u, file);
  }
});

test('assignment form remounts when the authoritative assignment identity changes', () => {
  const page = read('src/app/admin/companies/[id]/page.tsx');
  assert.match(page, /key=\{companyAssignmentFormIdentity\(currentAssignment\?\.id\)\}/u);
});

test('admin company detail keeps assignment operations beside one onboarding review surface', () => {
  const page = read('src/app/admin/companies/[id]/page.tsx');
  assert.match(page, /CompanyOnboardingAdminSummary/u);
  assert.match(page, /CompanyAssignmentForm/u);
  assert.match(page, /ReleaseCompanyProForm/u);
  assert.match(page, /assignmentHistory\.map/u);
});
