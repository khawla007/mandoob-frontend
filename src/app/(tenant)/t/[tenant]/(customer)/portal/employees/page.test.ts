import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const root = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/employees');
const page = readFileSync(join(root, 'page.tsx'), 'utf8');
const loader = readFileSync(
  join(process.cwd(), 'src/lib/data/customer-employee-registry.ts'),
  'utf8',
);

test('Customer employee page directly authorizes linked Company and uses only Customer registry loader', () => {
  assert.match(page, /authorizeCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(page, /listCustomerEmployeeRegistry/u);
  assert.doesNotMatch(
    page,
    /listProEmployeeRegistry|readAssignedCompanyForPro|requireProTenantRouteAccess/u,
  );
  assert.match(loader, /authorizeCustomerLinkedCompanyRead/u);
});

test('Customer employee registry is read-only and never exposes identifiers or mutation affordances', () => {
  assert.doesNotMatch(
    page,
    /employees\/import|NewEmployee|EditEmployee|DeactivateEmployee|passport|visaNo|emiratesId|email|phone/iu,
  );
  assert.match(page, /mutationsUnavailable/u);
  assert.match(page, /identifiersUnavailable/u);
});

test('Customer employee route includes loading, empty, filtered-empty, error, unavailable, unlinked, and permission truth', () => {
  for (const key of ['empty', 'noResults', 'error', 'partial', 'unlinked', 'permission'])
    assert.match(page, new RegExp(key));
  assert.match(readFileSync(join(root, 'loading.tsx'), 'utf8'), /EmployeeRegistryLoading/u);
  assert.match(readFileSync(join(root, 'error.tsx'), 'utf8'), /EmployeeRegistryError/u);
});

test('Customer employee messages preserve English/Arabic parity', () => {
  assert.deepEqual(
    Object.keys(en.customer.employeeRegistry).sort(),
    Object.keys(ar.customer.employeeRegistry).sort(),
  );
});
