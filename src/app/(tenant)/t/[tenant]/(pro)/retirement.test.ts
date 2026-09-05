import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const leadsPage = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/leads/page.tsx');
const leadsActions = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/leads/actions.ts');
const legacyCompany = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/clients/[companyId]/page.tsx');

test('retired PRO Leads direct route performs no tenant lead read and has no mutation actions', () => {
  const source = readFileSync(leadsPage, 'utf8');
  assert.match(source, /notFound\(\)/u);
  assert.doesNotMatch(source, /listTenantLeadKanban|getLeadDetail|LeadKanbanBoard/u);
  assert.equal(existsSync(leadsActions), false);
});

test('legacy Client compatibility validates the requested Company against the active assignment', () => {
  const source = readFileSync(legacyCompany, 'utf8');
  assert.match(source, /readAssignedCompanyForPro/u);
  assert.match(source, /companyId/u);
  assert.match(source, /company\.id\s*!==\s*companyId/u);
  assert.match(source, /notFound\(\)/u);
  assert.ok(source.indexOf('company.id !== companyId') < source.indexOf('permanentRedirect('));
});
