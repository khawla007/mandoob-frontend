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

test('finance analytics only renders evidence-backed assigned-company operational sections', () => {
  const analytics = read(`${base}/analytics/page.tsx`);
  assert.match(analytics, /paymentInvoiceStatus/);
  assert.match(analytics, /paymentMethods/);
  assert.match(analytics, /paymentAttempts/);
  assert.match(analytics, /hasMixedCurrencies/);
  assert.doesNotMatch(analytics, /companyRevenue/);
});

test('invoice detail does not expose raw provider, profile, or provider failure identifiers', () => {
  const detail = read(`${base}/[invoiceId]/page.tsx`);
  assert.doesNotMatch(detail, /Customer profile/);
  assert.doesNotMatch(detail, /payment\.failureReason/);
  assert.match(detail, /paymentAttempt\$\{payment\.context\}/);
  assert.match(detail, /formatInvoiceDate/);
});

test('verified payment mutations revalidate the exact invoice and assigned-company analytics route', () => {
  const actions = read(`${base}/actions.ts`);
  const accessAt = actions.indexOf('requireProTenantRouteAccess(slug)');
  const activeAt = actions.indexOf('requireActiveTenant(tenant.id)');
  const headersAt = actions.indexOf('headers()');
  assert.ok(accessAt >= 0 && accessAt < activeAt && activeAt < headersAt);
  assert.match(
    actions,
    /revalidatePath\(`\/t\/\$\{ctx\.tenantSlug\}\/payments\/\$\{parsed\.invoiceId\}`\)/,
  );
  assert.match(actions, /revalidatePath\(`\/t\/\$\{ctx\.tenantSlug\}\/payments\/analytics`\)/);
});

test('payment actions never return raw provider or database exception text', () => {
  const actions = read(`${base}/actions.ts`);
  const mapError = actions.slice(actions.indexOf('function mapError'));
  assert.doesNotMatch(mapError, /err\.message/);
  assert.match(mapError, /Operation could not be completed/);
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
