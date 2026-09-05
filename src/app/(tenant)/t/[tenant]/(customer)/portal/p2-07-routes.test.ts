import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const root = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('each P2.07 Customer page directly authorizes its linked Company and has one h1', () => {
  for (const path of ['company/page.tsx', 'pro/page.tsx', 'settings/page.tsx']) {
    const source = read(path);
    assert.match(source, /authorizeCustomerLinkedCompanyRead\(slug\)/u);
    assert.equal(source.match(/<h1(?:\s|>)/gu)?.length, 1, path);
    assert.doesNotMatch(source, /requireTenantRouteAccess|readCurrentCompanyAssignment/u);
  }
});

test('P2.07 pages have route loading and error boundaries', () => {
  for (const route of ['company', 'pro', 'settings']) {
    assert.match(read(`${route}/loading.tsx`), /DashboardRoleRouteLoading/u);
    assert.match(read(`${route}/error.tsx`), /DashboardRoleRouteError/u);
  }
});

test('settings groups working account routes, exact Company context, legal links, erasure, and typed unavailable preferences', () => {
  const source = read('settings/page.tsx');
  for (const href of ['href="/account"', 'href="/account/security"']) {
    assert.match(source, new RegExp(href));
  }
  assert.doesNotMatch(source, /href="\/account\/sessions"/u);
  assert.match(source, /sessionsUnavailable/u);
  assert.match(source, /getTenantBrandingSource\(access\.tenant\.id\)/u);
  assert.match(source, /company\.companyName/u);
  assert.match(source, /account\/erasure/u);
  assert.match(source, /preferencesUnavailable/u);
  assert.doesNotMatch(source, /consent_opt_outs|opted_out|enabled:\s*true/u);
});

test('Customer P2.07 catalogs preserve English and Arabic deep key parity', () => {
  const shape = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
      : typeof value;
  assert.deepEqual(shape(en.customer.company), shape(ar.customer.company));
  assert.deepEqual(shape(en.customer.assignedPro), shape(ar.customer.assignedPro));
  assert.deepEqual(shape(en.customer.settings), shape(ar.customer.settings));
});

test('overview activates Company, PRO, and Settings destinations and keeps later modules disabled', () => {
  const source = read('page.tsx');
  assert.match(source, /loadCustomerAssignedPro\(access\)/u);
  for (const route of ['company', 'pro', 'settings'])
    assert.match(source, new RegExp(`href\\('${route}'\\)`));
  assert.doesNotMatch(source, /href\('(?:employees|payments)'\)/u);
});
