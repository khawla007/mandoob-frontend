import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const base = 'src/app/(tenant)/t/[tenant]/(pro)/payments';

test('PRO finance pages remain assigned-company scoped without a Company selector or column', () => {
  const list = read(`${base}/page.tsx`);
  const table = read('src/components/pro/InvoicesTable.tsx');
  const detail = read(`${base}/[invoiceId]/page.tsx`);
  const analytics = read(`${base}/analytics/page.tsx`);
  const receipt = read(`${base}/[invoiceId]/receipt/route.ts`);

  for (const page of [list, detail, analytics, receipt]) {
    assert.match(page, /requireProTenantRouteAccess\(slug\)/);
    const accessAt = page.indexOf('requireProTenantRouteAccess(slug)');
    const activeAt = page.indexOf('requireActiveTenant(tenant.id)');
    const companyAt = page.indexOf('readAssignedCompanyForPro(session.id, slug)');
    assert.ok(accessAt >= 0 && accessAt < activeAt && activeAt < companyAt);
    assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/);
    assert.match(page, /company\.tenantId !== tenant\.id/);
  }
  assert.doesNotMatch(table, /<TableHead>Company<\/TableHead>/);
  assert.doesNotMatch(analytics, /Revenue by company|<TableHead>Company<\/TableHead>/);
});

test('PRO receipt selects and audits an immutable authoritative record after company authorization', () => {
  const receipt = read(`${base}/[invoiceId]/receipt/route.ts`);
  const authorized = receipt.indexOf('readAssignedCompanyForPro(session.id, slug)');
  const selected = receipt.lastIndexOf('parseReceiptSelection');
  const loaded = receipt.lastIndexOf('loadAuthoritativeReceipt');
  assert.ok(authorized >= 0 && authorized < selected && selected < loaded);
  assert.match(receipt, /actorRole: 'pro'/u);
  assert.match(receipt, /receiptDownloadHeaders/u);
  assert.doesNotMatch(receipt, /getReceiptPayloadForTenant/u);
});

test('PRO receipt links require authoritative snapshot availability, never invoice status', () => {
  const table = read('src/components/pro/InvoicesTable.tsx');
  const detail = read(`${base}/[invoiceId]/page.tsx`);
  const invoices = read('src/lib/data/invoices.ts');
  const migration = read('supabase/migrations/20260922091000_p309_finance_commands.sql');
  assert.match(table, /row\.receiptAvailable/u);
  assert.doesNotMatch(table, /row\.status === 'paid'[\s\S]*?\/receipt/u);
  assert.match(detail, /invoice\.receiptAvailable/u);
  assert.doesNotMatch(detail, /const canShowReceipt[\s\S]*?invoice\.status/u);
  assert.match(invoices, /receipt_available/u);
  assert.match(migration, /finance_receipt_snapshots/u);
  assert.match(migration, /receipt_available/u);
});

test('finance analytics only renders evidence-backed assigned-company operational sections', () => {
  const analytics = read(`${base}/analytics/page.tsx`);
  assert.match(analytics, /paymentInvoiceStatus/);
  assert.match(analytics, /paymentMethods/);
  assert.match(analytics, /paymentAttempts/);
  assert.match(analytics, /hasMixedCurrencies/);
  assert.doesNotMatch(analytics, /companyRevenue/);
  assert.match(analytics, /loadFinanceReport/u);
  assert.match(analytics, /tenantId: tenant\.id/u);
  assert.match(analytics, /companyId: company\.id/u);
  assert.match(analytics, /payments\/export\?month=/u);
});

test('invoice detail does not expose raw provider, profile, or provider failure identifiers', () => {
  const detail = read(`${base}/[invoiceId]/page.tsx`);
  const invoices = read('src/lib/data/invoices.ts');
  assert.doesNotMatch(detail, /Customer profile/);
  assert.doesNotMatch(detail, /payment\.failureReason/);
  assert.match(detail, /paymentAttempt\$\{payment\.context\}/);
  assert.match(detail, /formatInvoiceDate/);
  assert.doesNotMatch(invoices, /select\('id, action, created_at, details'\)/u);
  assert.doesNotMatch(invoices, /details: a\.details/u);
});

test('verified payment mutations revalidate the exact invoice and assigned-company analytics route', () => {
  const actions = read(`${base}/actions.ts`);
  const accessAt = actions.indexOf('requireProTenantRouteAccess(tenantSlug)');
  const activeAt = actions.indexOf('requireActiveTenant(tenant.id)');
  const companyAt = actions.indexOf('readAssignedCompanyForPro(session.id, tenant.slug)');
  assert.ok(accessAt >= 0 && accessAt < activeAt && activeAt < companyAt);
  assert.match(actions, /`\/t\/\$\{slug\}\/payments\/\$\{invoiceId\}`/u);
  assert.match(actions, /`\/t\/\$\{slug\}\/payments\/analytics`/u);
  assert.match(actions, /`\/t\/\$\{slug\}\/portal\/payments\/\$\{invoiceId\}`/u);
});

test('payment actions never return raw provider or database exception text', () => {
  const actions = read(`${base}/actions.ts`);
  const presentation = actions.slice(actions.indexOf('function present'));
  assert.doesNotMatch(presentation, /error\.message|err\.message/);
  assert.match(presentation, /Operation could not be completed/);
});

test('finance strings have English and Arabic parity', () => {
  for (const locale of ['en', 'ar']) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as {
      pro: Record<string, unknown>;
    };
    for (const key of [
      'paymentAnalyticsTitle',
      'paymentAnalyticsSubtitle',
      'paymentInvoiceStatus',
      'paymentMethods',
      'paymentMixedCurrencyNotice',
      'paymentAttempts',
      'paymentDetailsUnavailable',
      'paymentReceiptUnavailable',
    ]) {
      assert.equal(typeof messages.pro[key], 'string', `${locale}.${key}`);
    }
  }
});

test('finance renders accepted payment enums and audit actions through localized maps', () => {
  const analytics = read(`${base}/analytics/page.tsx`);
  const detail = read(`${base}/[invoiceId]/page.tsx`);
  for (const source of [analytics, detail]) {
    assert.match(source, /initiated: 'paymentStatusInitiated'/);
    assert.match(source, /mada: 'paymentMethodMada'/);
    assert.match(source, /apple_pay: 'paymentMethodApplePay'/);
  }
  assert.match(detail, /invoice_marked_paid: 'paymentAuditInvoicePaid'/);
  assert.match(detail, /refund_issued: 'paymentAuditRefundSucceeded'/);
});
