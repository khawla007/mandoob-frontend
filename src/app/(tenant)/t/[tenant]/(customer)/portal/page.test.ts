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

test('Customer overview only loads Company data from an authorized linked-Company result', () => {
  assert.match(page, /const access = await authorizeCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(page, /access\.kind === 'authorized'[\s\S]*?loadCustomerOverview\(access\)/u);
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

test('Customer overview emits no dead or context-unconsumed destinations', () => {
  for (const route of ['company', 'pro', 'settings']) {
    assert.match(page, new RegExp(`href\\('${route}'\\)`));
  }
  assert.doesNotMatch(page, /href\('(?:employees|payments)'/u);
  assert.doesNotMatch(page, /requestId|invoiceId|\{ focus:/u);
  assert.match(page, /aria-disabled="true"/u);
});

test('Customer overview catalogs preserve English and Arabic key parity', () => {
  assert.deepEqual(
    Object.keys(en.customer.overview).sort(),
    Object.keys(ar.customer.overview).sort(),
  );
});

test('Customer invoice overview read retains actor, tenant, and linked-Company ownership', () => {
  assert.doesNotMatch(loader, /getInvoicesForCustomer/u);
  assert.match(
    loader,
    /loadCustomerOverviewInvoices\(store, tenant\.id, company\.id, session\.id\)/u,
  );
  assert.match(loader, /\.eq\('tenant_id', tenantId\)/u);
  assert.match(loader, /\.eq\('company_id', companyId\)/u);
  assert.match(loader, /\.eq\('customer_profile_id', profileId\)/u);
  assert.match(loader, /count:\s*'exact',\s*head:\s*true/u);
  assert.match(loader, /\.limit\(10\)/u);
});

test('overview avoids unbounded list helpers and admin-only assignment reads', () => {
  assert.doesNotMatch(
    loader,
    /listOpenRequestsForCompany|listDocumentsForCompany|listRenewalsForCompany|readCurrentCompanyAssignment/u,
  );
  assert.match(loader, /assignment:\s*null/u);
  assert.match(page, /loadCustomerAssignedPro\(access\)/u);
  assert.match(loader, /communications:\s*null/u);
  assert.doesNotMatch(loader, /getCommsForCustomer/u);
  assert.match(loader, /\.order\('due_date',[\s\S]*?\.order\('id',[\s\S]*?\.limit\(/u);
});

test('requested and submitted documents settle and render independently', () => {
  assert.match(loader, /documentRequests:\s*loadCustomerOverviewDocumentRequests/u);
  assert.match(loader, /documents:\s*loadCustomerOverviewDocuments/u);
  assert.match(page, /PanelState state=\{overview\.documentRequests\}/u);
  assert.match(page, /PanelState state=\{overview\.documents\}/u);
  assert.doesNotMatch(loader, /hasMore:[\s\S]*?requests[\s\S]*?documents/u);
});

test('request actions convert timestamptz deadlines through Dubai business date', () => {
  assert.match(page, /dueDate:\s*customerDubaiDate\(request\.dueDate\)/u);
  assert.doesNotMatch(page, /dueDate:\s*dateOnly\(request\.dueDate\)/u);
});

test('overflowed document status subtotals render typed unavailable, never zero-plus', () => {
  assert.match(page, /documentSummary\.reviewed\.kind === 'complete'/u);
  assert.match(page, /documents\.statusCountsUnavailable/u);
  assert.doesNotMatch(page, /reviewedMore|rejectedMore/u);
});

test('communications slot is explicitly unavailable rather than a false empty history', () => {
  assert.match(page, /PanelState state=\{overview\.communications\}/u);
  assert.doesNotMatch(page, /overview\.communications\.value\.map/u);
});

test('overview performs no unused profile read', () => {
  assert.doesNotMatch(loader, /getProfileCard|profile:/u);
});

test('invoice panel distinguishes an overdue open invoice from other bounded recent statuses', () => {
  assert.match(page, /invoice\.status === 'open'/u);
  assert.match(page, /customerDeadlineUrgency\(invoice\.dueDate, generatedAt\) === 'overdue'/u);
  assert.equal(en.customer.overview.invoices.status.overdue, 'Overdue');
  assert.ok(ar.customer.overview.invoices.status.overdue);
});

test('registration signal is typed unavailable while lifecycle remains separately labelled', () => {
  assert.match(page, /signal === 'registration'\) return t\('registrationUnavailable'\)/u);
  assert.match(page, /registration\.lifecycle/u);
});

test('Customer overview activates the existing Signal Studio semantic scale and surfaces', () => {
  assert.match(styles, /\[data-nav-kind='customer'\]\s*\{[\s\S]*?--signal-scale:/u);
  assert.match(styles, /\[data-nav-kind='customer'\][\s\S]*?--signal-panel-surface:/u);
});
