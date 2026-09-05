import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const list = readFileSync(join(process.cwd(), 'src/app/admin/companies/page.tsx'), 'utf8');
const detail = readFileSync(join(process.cwd(), 'src/app/admin/companies/[id]/page.tsx'), 'utf8');

test('company directory has compact header and page-scoped assignment summaries', () => {
  assert.match(list, /DashboardPageHeader/u);
  assert.match(list, /summarizeVisibleCompanies\(companies\.rows\)/u);
  assert.match(list, /summary\.assigned/u);
  assert.match(list, /summary\.unassigned/u);
  assert.match(list, /summary\.lifecycleAttention/u);
  assert.match(list, /pageScope/u);
  assert.doesNotMatch(list, /registration.*companyStatus|companyStatus.*registration/iu);
});

test('company detail distinguishes legal, activation, registration, lifecycle and assignment states', () => {
  assert.match(detail, /detail\.stateDefinitions\.legal/u);
  assert.match(detail, /detail\.stateDefinitions\.activation/u);
  assert.match(detail, /detail\.stateDefinitions\.registration/u);
  assert.match(detail, /detail\.stateDefinitions\.lifecycle/u);
  assert.match(detail, /detail\.stateDefinitions\.assignment/u);
  assert.match(detail, /detail\.stateDefinitions\.registrationUnavailable/u);
  assert.doesNotMatch(detail, /inferRegistration|registrationStatus\s*=\s*company/u);
});
