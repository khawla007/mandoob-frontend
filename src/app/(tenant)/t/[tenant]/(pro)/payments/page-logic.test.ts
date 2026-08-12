import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parsePaymentView, paymentViewHref } from './page-logic';

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
  assert.match(page, /parsePaymentView\(search\.view\)/);
  assert.match(page, /listInvoicesForPaymentView\(tenant\.id/);
  assert.match(invoices, /classifyCollectionInvoiceIds/);
  assert.match(invoices, /load\(from, from \+ PAYMENT_QUERY_BATCH_SIZE - 1\)/);
  assert.match(invoices, /\.eq\('tenant_id', tenantId\)/);
});
