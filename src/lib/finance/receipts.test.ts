import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseReceiptSelection, receiptDownloadHeaders, sanitizeReceiptSnapshot } from './receipts';

test('receipt selection defaults to the invoice receipt and rejects guessing inputs', () => {
  assert.deepEqual(parseReceiptSelection(new URL('https://m.test/receipt'), 'invoice-1'), {
    kind: 'invoice',
    id: 'invoice-1',
  });
  assert.deepEqual(
    parseReceiptSelection(
      new URL('https://m.test/receipt?kind=payment&receiptId=payment-1'),
      'invoice-1',
    ),
    { kind: 'payment', id: 'payment-1' },
  );
  for (const url of [
    'https://m.test/receipt?kind=payment',
    'https://m.test/receipt?receiptId=payment-1',
    'https://m.test/receipt?kind=credit_note&receiptId=x',
    'https://m.test/receipt?kind=refund&receiptId=a&receiptId=b',
  ]) {
    assert.equal(parseReceiptSelection(new URL(url), 'invoice-1'), null);
  }
});

test('receipt snapshots preserve partial payments, successful refunds, VAT, and branding', () => {
  const snapshot = sanitizeReceiptSnapshot({
    receiptKind: 'payment',
    receiptId: 'pay-1',
    invoiceId: 'inv-1',
    tenantName: 'Atlas',
    tenantColor: '#0f766e',
    companyName: 'Acme',
    customerName: 'Fatima',
    label: 'Renewal',
    currency: 'AED',
    subtotalMinor: 10000,
    discountMinor: 500,
    vatMinor: 475,
    totalMinor: 9975,
    paidMinor: 5000,
    refundedMinor: 1000,
    status: 'partially_refunded',
    occurredAt: '2026-09-30T20:00:00.000Z',
    paymentMethod: 'card',
    lines: [{ description: 'Service', netMinor: 9500, vatMinor: 475, totalMinor: 9975 }],
    refunds: [{ id: 'ref-1', amountMinor: 1000, status: 'succeeded', reason: 'Partial' }],
  });
  assert.ok(snapshot);
  assert.equal(snapshot?.vatMinor, 475);
  assert.equal(snapshot?.paidMinor, 5000);
  assert.equal(snapshot?.refundedMinor, 1000);
  assert.equal(snapshot?.tenantColor, '#0f766e');
  assert.equal(snapshot?.refunds.length, 1);
});

test('receipt snapshots fail closed on unsafe money, currency, or cross-record totals', () => {
  const base = {
    receiptKind: 'invoice',
    receiptId: 'inv-1',
    invoiceId: 'inv-1',
    tenantName: 'Atlas',
    tenantColor: null,
    companyName: 'Acme',
    customerName: null,
    label: 'Renewal',
    currency: 'AED',
    subtotalMinor: 100,
    discountMinor: 0,
    vatMinor: 5,
    totalMinor: 105,
    paidMinor: 0,
    refundedMinor: 0,
    status: 'open',
    occurredAt: '2026-09-01T00:00:00Z',
    paymentMethod: null,
    lines: [],
    refunds: [],
  };
  assert.equal(sanitizeReceiptSnapshot({ ...base, currency: 'aed' }), null);
  assert.equal(sanitizeReceiptSnapshot({ ...base, totalMinor: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(sanitizeReceiptSnapshot({ ...base, totalMinor: 104 }), null);
});

test('receipt response is private, uncached, and has a safe filename', () => {
  assert.deepEqual(receiptDownloadHeaders('payment', '../INV\r\nInjected'), {
    'cache-control': 'private, no-store',
    'content-disposition': 'inline; filename="receipt-payment-INV-Injected.pdf"',
    'content-type': 'application/pdf',
  });
});

test('receipt RPC verifies role and ownership before atomically auditing access and generation', () => {
  const sql = readFileSync('supabase/migrations/20260922093500_p309_finance_reports.sql', 'utf8');
  const body = sql.slice(sql.indexOf('create function public.p309_generate_finance_receipt'));
  assert.match(body, /p_actor_role not in \('customer','pro','admin','super_admin'\)/u);
  assert.match(body, /pro_company_assignments/u);
  assert.match(body, /v_invoice\.customer_profile_id is distinct from p_actor_id/u);
  assert.match(body, /receipt\.aggregate_kind = p_receipt_kind/u);
  assert.match(body, /receipt\.aggregate_id = p_receipt_id/u);
  assert.match(body, /finance_receipt_snapshots/u);
  assert.match(body, /customer_profiles customer/u);
  assert.match(body, /customer\.linked_company_id=p_company_id/u);
  assert.doesNotMatch(body, /select \* into v_tenant/u);
  assert.match(body, /finance\.receipt_accessed/u);
  assert.match(body, /finance\.receipt_generated/u);
});
