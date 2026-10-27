import assert from 'node:assert/strict';
import test from 'node:test';
import { REPORT_CATALOG, resolveReportAvailability, type ReportSourceState } from './catalog';
import { aggregateOperationalFacts, aggregateFinanceFacts } from './aggregates';
import { buildDubaiMonthPeriod } from './periods';

test('report catalog marks integrated domain sources as required and keeps pending runtime unavailable', () => {
  assert.equal(REPORT_CATALOG.version, 1);
  assert.equal(REPORT_CATALOG.reports['platform-operations'].currency, 'AED');
  assert.equal(REPORT_CATALOG.reports['platform-operations'].sources.p305, 'required');
  assert.equal(REPORT_CATALOG.reports['platform-operations'].sources.p306, 'required');
  assert.equal(REPORT_CATALOG.reports['platform-operations'].sources.p309, 'required');
  assert.equal(REPORT_CATALOG.reports['platform-operations'].sources.p310, 'unintegrated');
  assert.equal(REPORT_CATALOG.reports['platform-finance'].sources.p309, 'required');
  assert.equal(
    resolveReportAvailability(REPORT_CATALOG.reports['platform-operations'], {
      local: 'fresh',
      p305: 'missing',
      p306: 'missing',
      p309: 'missing',
    }),
    'unavailable',
  );
  assert.equal(
    resolveReportAvailability(REPORT_CATALOG.reports['platform-finance'], {
      local: 'fresh',
      p309: 'missing',
    }),
    'unavailable',
  );
});

test('combined authoritative sources are ready only when every required adapter is fresh', () => {
  assert.equal(
    resolveReportAvailability(REPORT_CATALOG.reports['platform-finance'], { p309: 'fresh' }),
    'ready',
  );
  assert.equal(
    resolveReportAvailability(REPORT_CATALOG.reports['platform-operations'], {
      local: 'fresh',
      p305: 'fresh',
      p306: 'fresh',
      p309: 'fresh',
      p310: 'missing',
    }),
    'partial',
  );
});

test('Dubai reporting months use half-open UTC boundaries', () => {
  assert.deepEqual(buildDubaiMonthPeriod('2026-01'), {
    businessTimezone: 'Asia/Dubai',
    startInclusive: '2025-12-31T20:00:00.000Z',
    endExclusive: '2026-01-31T20:00:00.000Z',
    label: '2026-01',
  });
  assert.deepEqual(buildDubaiMonthPeriod('2024-02'), {
    businessTimezone: 'Asia/Dubai',
    startInclusive: '2024-01-31T20:00:00.000Z',
    endExclusive: '2024-02-29T20:00:00.000Z',
    label: '2024-02',
  });
  assert.throws(() => buildDubaiMonthPeriod('2026-13'), /reporting month/u);
});

test('operational aggregation preserves zeros, ignores orphan facts, and names partial sources', () => {
  const sources: ReportSourceState[] = [
    { source: 'companies', state: 'fresh', freshAt: '2026-10-27T05:00:00.000Z' },
    { source: 'renewals', state: 'unavailable', reason: 'P3_08_RUNTIME_UNAVAILABLE' },
  ];
  assert.deepEqual(
    aggregateOperationalFacts(
      [
        { id: 'a', companyId: 'company-1', kind: 'employee', state: 'active' },
        { id: 'b', companyId: null, kind: 'employee', state: 'active' },
        { id: 'c', companyId: 'company-1', kind: 'renewal', state: 'overdue' },
      ],
      'company-1',
      sources,
    ),
    {
      activeEmployees: 1,
      overdueRenewals: 1,
      scheduledMeetings: 0,
      state: 'partial',
      unavailableSources: ['renewals'],
      sourceFreshness: { companies: '2026-10-27T05:00:00.000Z' },
    },
  );
});

test('operational aggregation retains exact large integer counts', () => {
  const rows = Array.from({ length: 10_001 }, (_, index) => ({
    id: `employee-${index}`,
    companyId: 'company-1',
    kind: 'employee' as const,
    state: 'active',
  }));
  assert.equal(aggregateOperationalFacts(rows, 'company-1', []).activeEmployees, 10_001);
});

test('finance aggregation excludes draft and void invoices and subtracts successful refunds', () => {
  const result = aggregateFinanceFacts([
    { id: 'draft', status: 'draft', currency: 'AED', paidMinor: 9000, refundedMinor: 0 },
    { id: 'void', status: 'void', currency: 'AED', paidMinor: 8000, refundedMinor: 0 },
    { id: 'paid', status: 'paid', currency: 'AED', paidMinor: 7000, refundedMinor: 1250 },
    { id: 'usd', status: 'paid', currency: 'USD', paidMinor: 5000, refundedMinor: 0 },
  ]);
  assert.deepEqual(result, {
    currency: 'AED',
    collectedMinor: 5750,
    includedInvoices: 1,
    excludedInvoices: 3,
  });
});
