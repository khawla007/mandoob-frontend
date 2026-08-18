import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parsePaymentSearch,
  parsePaymentPage,
  parsePaymentView,
  paymentPageHref,
  paymentViewHref,
} from './page-logic';

test('payment page parser accepts safe positive integers only', () => {
  assert.equal(parsePaymentPage('2'), 2);
  for (const value of ['0', '-1', '1.5', '1e999', '9007199254740992', 'nope']) {
    assert.equal(parsePaymentPage(value), 1, value);
  }
  assert.equal(parsePaymentPage(['3', '999']), 3);
});

test('payment view parser consumes the four collection categories and rejects unsupported input', () => {
  for (const view of ['billed', 'paid', 'due-soon', 'overdue'] as const) {
    assert.equal(parsePaymentView(view), view);
    assert.equal(parsePaymentView([view, 'ignored']), view);
  }
  assert.equal(parsePaymentView('invented'), 'all');
  assert.equal(parsePaymentView(undefined), 'all');
});

test('payment filter navigation emits only supported view parameters', () => {
  assert.equal(paymentViewHref('north star', 'all'), '/t/north%20star/payments');
  for (const view of ['billed', 'paid', 'due-soon', 'overdue'] as const) {
    assert.equal(paymentViewHref('north star', view), `/t/north%20star/payments?view=${view}`);
  }
});

test('payments page consumes view through a paginated tenant-scoped finance read', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/page.tsx'),
    'utf8',
  );
  const invoices = readFileSync(join(process.cwd(), 'src/lib/data/invoices.ts'), 'utf8');
  assert.match(page, /searchParams:\s*Promise/);
  assert.match(page, /parsePaymentSearch\(search\)/);
  assert.match(page, /listInvoicesForPaymentView\(tenant\.id, company\.id/);
  assert.doesNotMatch(invoices, /collectPaymentQueryPages|PAYMENT_QUERY_BATCH_SIZE/);
  assert.match(invoices, /rpc\(\s*'list_company_payment_invoices'/);
  assert.match(invoices, /\.range\(\(page - 1\) \* PAYMENT_INVOICE_PAGE_SIZE/);
  assert.match(invoices, /\.eq\('tenant_id', tenantId\)/);
  assert.match(invoices, /\.eq\('company_id', companyId\)/);
});

test('payments consume exact invoice deadline filters', () => {
  assert.deepEqual(
    parsePaymentSearch({
      view: 'due-date',
      date: '2026-08-12',
      period: 'afternoon',
      eventTypes: 'invoice',
    }),
    { view: 'due-date', date: '2026-08-12', period: 'afternoon' },
  );
  assert.equal(
    paymentPageHref('acme', { view: 'due-date', date: '2026-08-12', period: 'afternoon' }, 2),
    '/t/acme/payments?view=due-date&date=2026-08-12&period=afternoon&eventTypes=invoice&page=2',
  );
});

test('0056 performs tenant-scoped DB pagination with restricted execution', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260812140000_0056_signal_payment_invoice_filter.sql',
    ),
    'utf8',
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /i\.tenant_id = p_tenant_id/g);
  assert.match(sql, /limit v_page_size offset/i);
  assert.match(sql, /revoke all[\s\S]*authenticated/i);
  assert.match(sql, /grant execute[\s\S]*service_role/i);
  assert.match(sql, /refunds[\s\S]*r\.tenant_id = p_tenant_id/i);
});
