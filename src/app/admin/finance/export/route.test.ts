import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const admin = readFileSync('src/app/admin/finance/export/route.ts', 'utf8');
const pro = readFileSync('src/app/(tenant)/t/[tenant]/(pro)/payments/export/route.ts', 'utf8');
const proAnalytics = readFileSync(
  'src/app/(tenant)/t/[tenant]/(pro)/payments/analytics/page.tsx',
  'utf8',
);
const adminPage = readFileSync('src/app/admin/finance/page.tsx', 'utf8');

test('finance exports authenticate exact role and company scopes before loading bounded pages', () => {
  assert.match(admin, /requirePlatformOperator\(\)/u);
  assert.match(pro, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(pro, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(pro, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.match(pro, /company\.tenantId !== tenant\.id/u);
  assert.match(proAnalytics, /randomUUID\(\)/u);
  assert.match(proAnalytics, /operationId=/u);
  assert.match(pro, /searchParams\.get\('operationId'\)/u);
  assert.match(pro, /operationIdSchema\.safeParse/u);
  assert.match(admin, /operationId: null/u);
  for (const source of [admin, pro]) {
    assert.match(source, /parseFinanceExportFilters/u);
    assert.match(source, /exportFinanceCsv/u);
    assert.match(source, /private, no-store/u);
  }
});

test('admin finance consumes the authoritative platform report and links its bounded export', () => {
  assert.match(adminPage, /loadFinanceReport/u);
  assert.match(adminPage, /tenantId: null/u);
  assert.match(adminPage, /companyId: null/u);
  assert.match(adminPage, /\/admin\/finance\/export\?month=/u);
});
