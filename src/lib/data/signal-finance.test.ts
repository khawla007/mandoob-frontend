import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCollectionInvoiceIds } from './signal-finance';

test('classifies more than 100 tenant invoices with reporting currency and Dubai boundaries', () => {
  const invoices = Array.from({ length: 125 }, (_, index) => ({
    id: `invoice-${index}`,
    tenant_id: 'tenant-a',
    currency: index === 124 ? 'USD' : 'AED',
    status: 'open',
    due_at: index === 0 ? '2026-08-11' : '2026-09-11',
    created_at: '2026-08-01T00:00:00Z',
  }));
  const result = classifyCollectionInvoiceIds({
    tenantId: 'tenant-a',
    invoices,
    payments: [],
    refunds: [],
    today: '2026-08-12',
  });
  assert.equal(result.currency, 'AED');
  assert.equal(result.billed.size, 124);
  assert.equal(result.overdue.has('invoice-0'), true);
  assert.equal(result.dueSoon.has('invoice-123'), true);
  assert.equal(result.dueSoon.has('invoice-124'), false);
});

test('paid classification uses current-month successful payments minus successful refunds per invoice', () => {
  const invoices = ['net', 'refunded', 'old', 'foreign'].map((id) => ({
    id,
    tenant_id: 'tenant-a',
    currency: id === 'foreign' ? 'USD' : 'AED',
    status: 'paid',
    due_at: null,
    created_at: '2026-08-01T00:00:00Z',
  }));
  const payments = [
    {
      id: 'p-net',
      tenant_id: 'tenant-a',
      invoice_id: 'net',
      currency: 'AED',
      status: 'succeeded',
      amount_minor: 1000,
      received_at: '2026-08-01T20:30:00Z',
    },
    {
      id: 'p-refund',
      tenant_id: 'tenant-a',
      invoice_id: 'refunded',
      currency: 'AED',
      status: 'partially_refunded',
      amount_minor: 500,
      received_at: '2026-08-03T00:00:00Z',
    },
    {
      id: 'p-old',
      tenant_id: 'tenant-a',
      invoice_id: 'old',
      currency: 'AED',
      status: 'succeeded',
      amount_minor: 1000,
      received_at: '2026-07-31T19:59:59Z',
    },
  ];
  const refunds = [
    {
      id: 'r-net',
      tenant_id: 'tenant-a',
      payment_id: 'p-net',
      status: 'succeeded',
      amount_minor: 200,
      created_at: '2026-08-04T00:00:00Z',
    },
    {
      id: 'r-full',
      tenant_id: 'tenant-a',
      payment_id: 'p-refund',
      status: 'succeeded',
      amount_minor: 500,
      created_at: '2026-08-04T00:00:00Z',
    },
    {
      id: 'r-old',
      tenant_id: 'tenant-a',
      payment_id: 'p-old',
      status: 'succeeded',
      amount_minor: 300,
      created_at: '2026-08-05T00:00:00Z',
    },
  ];
  const result = classifyCollectionInvoiceIds({
    tenantId: 'tenant-a',
    invoices,
    payments,
    refunds,
    today: '2026-08-12',
  });
  assert.deepEqual([...result.paid], ['net', 'old']);
});
