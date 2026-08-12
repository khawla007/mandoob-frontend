import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type { ProInvoiceRow } from '@/lib/data/invoices';
import { filterInvoicesForPaymentView, parsePaymentView, paymentViewHref } from './page-logic';

const invoice = (
  id: string,
  status: string,
  dates: Partial<Pick<ProInvoiceRow, 'createdAt' | 'dueAt' | 'paidAt'>> = {},
): ProInvoiceRow => ({
  id,
  clientId: 'client-1',
  clientName: 'Acme',
  customerProfileId: null,
  label: id,
  amount: 'AED 100.00',
  amountMinor: 10_000,
  currency: 'AED',
  status,
  createdAt: dates.createdAt ?? '2026-08-03T10:00:00.000Z',
  dueAt: dates.dueAt ?? null,
  paidAt: dates.paidAt ?? null,
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

test('collection views use precise invoice lifecycle and Dubai-date semantics', () => {
  const rows = [
    invoice('billed', 'open'),
    invoice('old-bill', 'open', { createdAt: '2026-07-31T10:00:00.000Z' }),
    invoice('draft', 'draft'),
    invoice('void', 'void'),
    invoice('paid', 'paid', { paidAt: '2026-08-04T11:00:00.000Z' }),
    invoice('old-paid', 'paid', { paidAt: '2026-07-30T11:00:00.000Z' }),
    invoice('due-today', 'open', { dueAt: '2026-08-12' }),
    invoice('due-30', 'open', { dueAt: '2026-09-11' }),
    invoice('due-later', 'open', { dueAt: '2026-09-12' }),
    invoice('overdue', 'open', { dueAt: '2026-08-11' }),
    invoice('closed-old', 'paid', { dueAt: '2026-08-11', paidAt: '2026-07-30T11:00:00Z' }),
  ];

  assert.deepEqual(
    filterInvoicesForPaymentView(rows, 'billed', '2026-08-12').map((row) => row.id),
    ['billed', 'paid', 'old-paid', 'due-today', 'due-30', 'due-later', 'overdue', 'closed-old'],
  );
  assert.deepEqual(
    filterInvoicesForPaymentView(rows, 'paid', '2026-08-12').map((row) => row.id),
    ['paid'],
  );
  assert.deepEqual(
    filterInvoicesForPaymentView(rows, 'due-soon', '2026-08-12').map((row) => row.id),
    ['due-today', 'due-30'],
  );
  assert.deepEqual(
    filterInvoicesForPaymentView(rows, 'overdue', '2026-08-12').map((row) => row.id),
    ['overdue'],
  );
  assert.equal(filterInvoicesForPaymentView(rows, 'all', '2026-08-12'), rows);
});

test('payments page consumes view only after resolving a tenant-scoped invoice read', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/payments/page.tsx'),
    'utf8',
  );
  const invoices = readFileSync(join(process.cwd(), 'src/lib/data/invoices.ts'), 'utf8');
  assert.match(page, /searchParams:\s*Promise/);
  assert.match(page, /parsePaymentView\(search\.view\)/);
  assert.match(page, /listInvoicesForTenant\(tenant\.id\)/);
  assert.match(page, /filterInvoicesForPaymentView\(invoices, view, today\)/);
  assert.match(invoices, /\.eq\('tenant_id', tenantId\)/);
});
