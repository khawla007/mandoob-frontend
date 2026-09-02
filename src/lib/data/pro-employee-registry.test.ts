import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  employeeRisk,
  maskIdentifierPresence,
  parseEmployeeRegistrySearch,
} from './pro-employee-registry';

test('registry search accepts only bounded, deterministic filter values', () => {
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: '  registry  ',
      status: 'active',
      identity: 'visa',
      risk: 'attention',
      page: '2',
    }),
    { q: 'registry', status: 'active', identity: 'visa', risk: 'attention', page: 2, focus: null },
  );
  assert.deepEqual(
    parseEmployeeRegistrySearch({
      q: 'x'.repeat(300),
      status: 'mutated',
      page: '-2',
      focus: 'not-a-uuid',
    }),
    { q: '', status: 'all', identity: 'all', risk: 'all', page: 1, focus: null },
  );
});

test('registry reports renewal attention from only date-backed visa and EID values', () => {
  assert.equal(employeeRisk('2026-05-31', null, new Date('2026-05-01T00:00:00Z')), 'attention');
  assert.equal(employeeRisk(null, '2026-12-01', new Date('2026-05-01T00:00:00Z')), 'clear');
  assert.equal(employeeRisk(null, null, new Date('2026-05-01T00:00:00Z')), 'unknown');
});

test('registry never returns identity values and uses only a presence-safe mask', () => {
  assert.equal(maskIdentifierPresence(null), 'missing');
  assert.equal(maskIdentifierPresence('encrypted-value'), 'recorded');
});

test('registry page is a Company-scoped, server-paginated read-only workspace', () => {
  const root = process.cwd();
  const page = readFileSync(
    join(root, 'src/app/(tenant)/t/[tenant]/(pro)/employees/page.tsx'),
    'utf8',
  );
  const data = readFileSync(join(root, 'src/lib/data/pro-employee-registry.ts'), 'utf8');

  assert.match(page, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.match(page, /listProEmployeeRegistry\(tenant\.id, company\.id,/u);
  assert.match(data, /\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('company_id', companyId\)/u);
  assert.match(data, /count: 'exact'/u);
  assert.match(
    data,
    /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: true \}\)/u,
  );
  assert.doesNotMatch(page, /ComingSoon|create|update|delete|document request/iu);
  assert.doesNotMatch(data, /passport_no_encrypted|visa_no_encrypted|emirates_id_encrypted/iu);
});
