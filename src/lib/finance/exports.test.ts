import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { financeRowsToCsv, parseFinanceExportFilters } from './exports';

const reportSql = readFileSync(
  new URL('../../../supabase/migrations/20260922093500_p309_finance_reports.sql', import.meta.url),
  'utf8',
);
const repositorySource = readFileSync(new URL('./exports.ts', import.meta.url), 'utf8');

test('CSV neutralizes formulas, newlines, and control characters', () => {
  const csv = financeRowsToCsv([
    {
      occurredAt: '2026-09-01T00:00:00.000Z',
      kind: 'invoice',
      reference: '=HYPERLINK("bad")',
      amountMinor: 0,
      currency: 'AED',
    },
    {
      occurredAt: '2026-09-02T00:00:00.000Z',
      kind: 'payment',
      reference: 'line one\nline two\u0000',
      amountMinor: 1,
      currency: 'AED',
    },
  ]);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/u);
  assert.doesNotMatch(csv, /line one\nline two/u);
  assert.match(csv, /line one line two/u);
  assert.match(csv, /,0,AED/u);
});

test('CSV columns exclude internal, provider, storage, and secret fields', () => {
  const csv = financeRowsToCsv([
    {
      occurredAt: '2026-09-01T00:00:00Z',
      kind: 'payment',
      reference: 'PAY-1',
      amountMinor: 100,
      currency: 'AED',
      providerChargeId: 'ch_secret',
      storagePath: 'private/path',
      operationReceiptId: 'internal',
    } as never,
  ]);
  assert.equal(csv.split('\r\n')[0], 'occurred_at,kind,reference,amount_minor,currency');
  assert.doesNotMatch(csv, /ch_secret|private\/path|operationReceiptId|payment_allocation/u);
});

test('export filters are exact, bounded, and use half-open Dubai dates', () => {
  assert.deepEqual(
    parseFinanceExportFilters(
      new URL('https://m.test/export?month=2026-09&currency=AED&kind=refund&limit=10000'),
    ),
    {
      start: '2026-08-31T20:00:00.000Z',
      end: '2026-09-30T20:00:00.000Z',
      currency: 'AED',
      kind: 'refund',
      limit: 10000,
    },
  );
  for (const query of [
    '?month=2026-09&currency=aed',
    '?month=2026-09&kind=provider',
    '?month=2026-09&limit=10001',
    '?month=2026-09&month=2026-10',
    '?month=2026-09&provider=secret',
  ]) {
    assert.equal(parseFinanceExportFilters(new URL(`https://m.test/export${query}`)), null);
  }
});

test('PRO export allowance is consumed atomically inside the owning export RPC', () => {
  const definition = reportSql.slice(
    reportSql.indexOf('create function public.p309_export_finance_page'),
    reportSql.indexOf('create function public.p309_generate_finance_receipt'),
  );
  assert.match(definition, /p_operation_id uuid/u);
  assert.match(definition, /p309_consume_plan_allowance/u);
  assert.match(definition, /finance_exports/u);
  assert.match(definition, /private\.p309_event_uuid\('finance-export:'/u);
  assert.match(definition, /PLAN_ALLOWANCE_/u);
  assert.match(repositorySource, /p_operation_id: scope\.operationId/u);
});
