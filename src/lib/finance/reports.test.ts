import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  aggregateLedgerReport,
  calculateSubscriptionMetrics,
  dubaiMonthKey,
  dubaiMonthRange,
  paginateStable,
  type LedgerReportRow,
} from './reports';

test('Dubai months use half-open UTC boundaries including year rollover', () => {
  assert.deepEqual(dubaiMonthRange('2026-09'), {
    start: '2026-08-31T20:00:00.000Z',
    end: '2026-09-30T20:00:00.000Z',
  });
  assert.deepEqual(dubaiMonthRange('2026-12'), {
    start: '2026-11-30T20:00:00.000Z',
    end: '2026-12-31T20:00:00.000Z',
  });
  assert.equal(dubaiMonthRange('2026-00'), null);
  assert.equal(dubaiMonthKey(new Date('2026-09-30T20:00:00.000Z')), '2026-10');
});

test('ledger report separates currencies and subtracts actual refunds from cash', () => {
  const rows: LedgerReportRow[] = [
    row('p1', 'payment_allocation', 'AED', 'cash_clearing', 1000, 0, '2026-09-01'),
    row('r1', 'cash_refund', 'AED', 'cash_clearing', 0, 250, '2026-09-02'),
    row('c1', 'credit_note', 'AED', 'refund_contra_revenue', 100, 0, '2026-09-03'),
    row('p2', 'payment_allocation', 'USD', 'cash_clearing', 300, 0, '2026-09-04'),
  ];
  const report = aggregateLedgerReport(rows, {
    start: '2026-08-31T20:00:00.000Z',
    end: '2026-09-30T20:00:00.000Z',
  });
  assert.equal(report.AED.cashCollectedMinor, 750);
  assert.equal(report.USD.cashCollectedMinor, 300);
});

test('recognition remains billed in month A and void reverses only in month B', () => {
  const rows: LedgerReportRow[] = [
    row('invoice-1', 'invoice', 'AED', 'receivable', 1050, 0, '2026-08-15', 'void'),
    row('invoice-1', 'invoice', 'AED', 'service_revenue', 0, 1000, '2026-08-15', 'void'),
    row('invoice-1', 'invoice', 'AED', 'vat_payable', 0, 50, '2026-08-15', 'void'),
    row('invoice-1', 'invoice_void', 'AED', 'receivable', 0, 1050, '2026-09-02', 'void'),
    row('invoice-1', 'invoice_void', 'AED', 'service_revenue', 1000, 0, '2026-09-02', 'void'),
  ];
  const august = aggregateLedgerReport(rows, dubaiMonthRange('2026-08')!);
  const september = aggregateLedgerReport(rows, dubaiMonthRange('2026-09')!);
  assert.equal(august.AED.billedMinor, 1050);
  assert.equal(august.AED.revenueMinor, 1000);
  assert.equal(september.AED.billedMinor, -1050);
  assert.equal(september.AED.revenueMinor, -1000);
});

test('P&L excludes output VAT, includes posted operating and compensation expense, and scopes rows', () => {
  const rows: LedgerReportRow[] = [
    row('i', 'invoice', 'AED', 'service_revenue', 0, 950, '2026-09-01', 'paid', 'company', 'c1'),
    row('i', 'invoice', 'AED', 'vat_payable', 0, 50, '2026-09-01', 'paid', 'company', 'c1'),
    row('e', 'expense', 'AED', 'expense', 200, 0, '2026-09-02', null, 'company', 'c1'),
    row('pc', 'compensation', 'AED', 'expense', 100, 0, '2026-09-03', null, 'company', 'c1'),
    row(
      'other',
      'invoice',
      'AED',
      'service_revenue',
      0,
      900,
      '2026-09-04',
      'paid',
      'company',
      'c2',
    ),
  ];
  const scoped = aggregateLedgerReport(rows, dubaiMonthRange('2026-09')!, {
    scopeKind: 'company',
    scopeId: 'c1',
  });
  assert.deepEqual(scoped.AED, {
    cashCollectedMinor: 0,
    billedMinor: 0,
    receivableMinor: 0,
    revenueMinor: 950,
    expenseMinor: 300,
    profitMinor: 650,
  });
});

test('subscription revenue is recognized only from a posted provider invoice journal', () => {
  const rows: LedgerReportRow[] = [
    row('ordinary', 'invoice', 'USD', 'subscription_revenue', 0, 900, '2026-09-01'),
    row('provider', 'subscription_invoice', 'USD', 'subscription_revenue', 0, 1200, '2026-09-02'),
  ];
  assert.equal(aggregateLedgerReport(rows, dubaiMonthRange('2026-09')!).USD.revenueMinor, 1200);
});

test('subscription metrics expose exact MRR/ARPU remainders and null zero-population rates', () => {
  const active = [
    { id: 'm', currency: 'USD', interval: 'month' as const, amountMinor: 1001 },
    { id: 'a', currency: 'USD', interval: 'year' as const, amountMinor: 12001 },
  ];
  const metrics = calculateSubscriptionMetrics(active, 1, 2);
  assert.deepEqual(metrics, {
    activePaidCount: 2,
    mrrMinor: 2001,
    mrrAnnualRemainderMinor: 1,
    arrNumeratorMinor: 24013,
    churnRate: { numerator: 1, denominator: 2 },
    arpuMinor: 1000,
    arpuRemainder: 13,
    arpuDenominator: 24,
  });
  assert.equal(calculateSubscriptionMetrics([], 0, 0).churnRate, null);
  assert.throws(
    () =>
      calculateSubscriptionMetrics(
        [...active, { id: 'mixed', currency: 'AED', interval: 'month', amountMinor: 1 }],
        0,
        0,
      ),
    /MIXED_CURRENCIES/u,
  );
});

test('stable cursor pagination traverses more than 1000 equal-time rows without duplication', () => {
  const rows = Array.from({ length: 1205 }, (_, index) => ({
    id: String(index).padStart(4, '0'),
    occurredAt: '2026-09-01T00:00:00.000Z',
  }));
  const seen: string[] = [];
  let cursor: { occurredAt: string; id: string } | null = null;
  do {
    const page: {
      rows: Array<{ id: string; occurredAt: string }>;
      nextCursor: { occurredAt: string; id: string } | null;
    } = paginateStable(rows, cursor, 137);
    seen.push(...page.rows.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 1205);
  assert.equal(new Set(seen).size, 1205);
});

test('report RPCs aggregate posted journals by accounting time and page in the database', () => {
  const sql = readFileSync('supabase/migrations/20260922093500_p309_finance_reports.sql', 'utf8');
  assert.match(sql, /journal\.state = 'posted'/u);
  assert.match(sql, /journal\.accounting_at >= p_start_at/u);
  assert.match(sql, /journal\.accounting_at < p_end_at/u);
  assert.doesNotMatch(sql, /invoice\.status\s*(?:=|in)/iu);
  assert.match(sql, /least\(1000/u);
  assert.match(sql, /order by (?:journal\.)?accounting_at desc,\s*(?:journal\.)?id desc/u);
});

function row(
  sourceId: string,
  sourceKind: LedgerReportRow['sourceKind'],
  currency: string,
  accountCode: LedgerReportRow['accountCode'],
  debitMinor: number,
  creditMinor: number,
  accountingAt: string,
  currentInvoiceStatus: string | null = null,
  scopeKind: LedgerReportRow['scopeKind'] = 'platform',
  scopeId = 'platform',
): LedgerReportRow {
  return {
    journalId: `${sourceId}-${accountCode}`,
    sourceId,
    sourceKind,
    currency,
    accountCode,
    debitMinor,
    creditMinor,
    accountingAt: `${accountingAt}T12:00:00.000Z`,
    currentInvoiceStatus,
    scopeKind,
    scopeId,
  };
}
