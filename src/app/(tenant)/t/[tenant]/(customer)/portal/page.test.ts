import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const pagePath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/page.tsx');
const loaderPath = join(process.cwd(), 'src/lib/data/customer-overview-loader.ts');
const stylesPath = join(process.cwd(), 'src/app/globals.css');
const page = readFileSync(pagePath, 'utf8');
const loader = readFileSync(loaderPath, 'utf8');
const styles = readFileSync(stylesPath, 'utf8');

test('Customer overview authorizes its exact actor and linked Company before scoped reads', () => {
  const accessAt = page.indexOf('authorizeCustomerLinkedCompanyRead');
  const dataAt = page.indexOf('loadCustomerOverview');
  assert.ok(accessAt >= 0);
  assert.ok(dataAt > accessAt);
  assert.doesNotMatch(page, /requireTenantRouteAccess|readSelfCustomer/u);
});

test('Customer overview renders the nine reference hierarchy regions and exactly five signals', () => {
  for (const marker of [
    'customer-overview__masthead',
    'customer-overview__signals',
    'customer-overview__registration',
    'customer-overview__actions',
    'customer-overview__renewals',
    'customer-overview__notifications',
    'customer-overview__documents',
    'customer-overview__employees',
    'customer-overview__invoices',
    'customer-overview__assigned-pro',
    'customer-overview__quick-actions',
  ])
    assert.match(page, new RegExp(marker));
  assert.match(page, /CUSTOMER_SIGNAL_ORDER/u);
  assert.doesNotMatch(page, /RegistrationProgressCard|getRegistrationProgress|customer-portal/u);
});

test('Customer overview owns no fake registration or P2.10 notification/task destination', () => {
  assert.match(page, /registrationUnavailable/u);
  assert.match(page, /notificationsUnavailable/u);
  assert.doesNotMatch(page, /\/notifications|\/tasks|registration.*percent|progress.*%/iu);
});

test('Customer overview catalogs preserve English and Arabic key parity', () => {
  assert.deepEqual(
    Object.keys(en.customer.overview).sort(),
    Object.keys(ar.customer.overview).sort(),
  );
});

test('Customer invoice overview read retains actor, tenant, and linked-Company ownership', () => {
  assert.doesNotMatch(loader, /getInvoicesForCustomer/u);
  assert.match(loader, /loadCustomerOverviewInvoices\(tenant\.id, company\.id, session\.id\)/u);
  assert.match(loader, /\.eq\('tenant_id', tenantId\)/u);
  assert.match(loader, /\.eq\('company_id', companyId\)/u);
  assert.match(loader, /\.eq\('customer_profile_id', profileId\)/u);
});

test('Customer overview activates the existing Signal Studio semantic scale and surfaces', () => {
  assert.match(styles, /\[data-nav-kind='customer'\]\s*\{[\s\S]*?--signal-scale:/u);
  assert.match(styles, /\[data-nav-kind='customer'\][\s\S]*?--signal-panel-surface:/u);
});
