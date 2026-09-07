import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('mature document and renewal routes retain role-specific authorization', () => {
  for (const domainName of ['documents', 'renewals']) {
    assert.match(
      source(`app/(tenant)/t/[tenant]/(pro)/${domainName}/page.tsx`),
      /readAssignedCompanyForPro/u,
    );
    assert.match(
      source(`app/(tenant)/t/[tenant]/(customer)/portal/${domainName}/page.tsx`),
      /authorizeCustomerLinkedCompanyRead/u,
    );
    assert.match(
      source(`app/(tenant)/t/[tenant]/(employee)/employee/${domainName}/page.tsx`),
      /authorizeEmployeePortalRead/u,
    );
  }
});

test('money stays in integer minor units with explicit currency', () => {
  const invoices = source('lib/data/invoices.ts');
  assert.match(invoices, /amount_minor/u);
  assert.match(invoices, /currency/u);
  assert.doesNotMatch(source('lib/shell/nav-employee.ts'), /payments|finance/u);
});

test('privileged audit remains an Admin-only cursor-backed surface', () => {
  const audit = source('app/admin/audit-logs/page.tsx');
  assert.match(audit, /requireRole\('super_admin'\)/u);
  assert.match(audit, /cursor/u);
  assert.doesNotMatch(source('lib/shell/nav-customer.ts'), /audit-logs/u);
  assert.doesNotMatch(source('lib/shell/nav-employee.ts'), /audit-logs/u);
});
