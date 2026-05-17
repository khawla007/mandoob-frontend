import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateReceiptPdf, isReceiptEligible, receiptFilename } from './receipt';

test('receiptFilename creates a stable pdf filename', () => {
  assert.equal(receiptFilename('INV-2026/05'), 'receipt-INV-2026-05.pdf');
});

test('isReceiptEligible only allows paid and refunded invoice states', () => {
  assert.equal(isReceiptEligible('paid'), true);
  assert.equal(isReceiptEligible('refunded'), true);
  assert.equal(isReceiptEligible('partially_refunded'), true);
  assert.equal(isReceiptEligible('open'), false);
  assert.equal(isReceiptEligible('void'), false);
});

test('generateReceiptPdf returns a non-empty PDF document', async () => {
  const bytes = await generateReceiptPdf({
    tenantName: 'Atlas PRO Services',
    tenantColor: '#0f766e',
    clientName: 'Acme FZ-LLC',
    customerName: 'Fatima Ali',
    invoiceId: 'INV-001',
    label: 'Trade license renewal',
    amount: 'AED 1,250.00',
    status: 'paid',
    paidAt: '2026-05-07T08:00:00.000Z',
    paymentMethod: 'card',
    paymentProvider: 'tap',
    refunds: [{ amount: 'AED 250.00', reason: 'Partial refund', status: 'succeeded' }],
  });

  assert.ok(bytes.length > 800);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('utf8'), '%PDF');
});
