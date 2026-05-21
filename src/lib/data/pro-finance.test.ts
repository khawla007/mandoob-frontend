import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateProFinanceDashboard, readProFinanceQueryData } from './pro-finance';

const tenantId = 'tenant-a';

test('calculateProFinanceDashboard excludes cross-tenant rows and computes PRO finance metrics', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId,
    today: '2026-05-21',
    clients: [
      { id: 'client-1', tenant_id: tenantId, company_name: 'Acme DMCC' },
      { id: 'client-2', tenant_id: tenantId, company_name: 'Beacon FZCO' },
      { id: 'client-other', tenant_id: 'tenant-b', company_name: 'Other Tenant' },
    ],
    invoices: [
      {
        id: 'invoice-paid',
        tenant_id: tenantId,
        client_id: 'client-1',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'paid',
        due_at: '2026-05-01',
        created_at: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 'invoice-open-overdue',
        tenant_id: tenantId,
        client_id: 'client-1',
        amount_minor: 5_000,
        currency: 'AED',
        status: 'open',
        due_at: '2026-05-20',
        created_at: '2026-05-02T08:00:00.000Z',
      },
      {
        id: 'invoice-open-current',
        tenant_id: tenantId,
        client_id: 'client-2',
        amount_minor: 7_000,
        currency: 'AED',
        status: 'open',
        due_at: '2026-05-21',
        created_at: '2026-05-03T08:00:00.000Z',
      },
      {
        id: 'invoice-void',
        tenant_id: tenantId,
        client_id: 'client-1',
        amount_minor: 99_000,
        currency: 'AED',
        status: 'void',
        due_at: '2026-05-10',
        created_at: '2026-05-04T08:00:00.000Z',
      },
      {
        id: 'invoice-other',
        tenant_id: 'tenant-b',
        client_id: 'client-other',
        amount_minor: 200_000,
        currency: 'AED',
        status: 'open',
        due_at: '2026-05-01',
        created_at: '2026-05-05T08:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'payment-succeeded',
        tenant_id: tenantId,
        invoice_id: 'invoice-paid',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-10T10:00:00.000Z',
        created_at: '2026-05-10T10:00:00.000Z',
      },
      {
        id: 'payment-partially-refunded',
        tenant_id: tenantId,
        invoice_id: 'invoice-paid',
        amount_minor: 2_000,
        currency: 'AED',
        status: 'partially_refunded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-11T10:00:00.000Z',
        created_at: '2026-05-11T10:00:00.000Z',
      },
      {
        id: 'payment-refunded',
        tenant_id: tenantId,
        invoice_id: 'invoice-paid',
        amount_minor: 3_000,
        currency: 'AED',
        status: 'refunded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-12T10:00:00.000Z',
        created_at: '2026-05-12T10:00:00.000Z',
      },
      {
        id: 'payment-failed',
        tenant_id: tenantId,
        invoice_id: 'invoice-open-overdue',
        amount_minor: 5_000,
        currency: 'AED',
        status: 'failed',
        method: 'card',
        provider: 'tap',
        failure_reason: 'Insufficient funds',
        received_at: null,
        created_at: '2026-05-19T10:00:00.000Z',
      },
      {
        id: 'payment-abandoned',
        tenant_id: tenantId,
        invoice_id: 'invoice-open-current',
        amount_minor: 7_000,
        currency: 'AED',
        status: 'abandoned',
        method: 'card',
        provider: 'tap',
        failure_reason: 'Customer abandoned checkout',
        received_at: null,
        created_at: '2026-05-20T10:00:00.000Z',
      },
      {
        id: 'payment-initiated',
        tenant_id: tenantId,
        invoice_id: 'invoice-open-current',
        amount_minor: 7_000,
        currency: 'AED',
        status: 'initiated',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-05-21T10:00:00.000Z',
      },
      {
        id: 'payment-other',
        tenant_id: 'tenant-b',
        invoice_id: 'invoice-other',
        amount_minor: 200_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-13T10:00:00.000Z',
        created_at: '2026-05-13T10:00:00.000Z',
      },
    ],
    refunds: [
      {
        id: 'refund-partial',
        tenant_id: tenantId,
        payment_id: 'payment-partially-refunded',
        amount_minor: 500,
        status: 'succeeded',
        reason: 'Partial refund',
        created_at: '2026-05-13T10:00:00.000Z',
      },
      {
        id: 'refund-full',
        tenant_id: tenantId,
        payment_id: 'payment-refunded',
        amount_minor: 3_000,
        status: 'succeeded',
        reason: 'Full refund',
        created_at: '2026-05-14T10:00:00.000Z',
      },
      {
        id: 'refund-pending',
        tenant_id: tenantId,
        payment_id: 'payment-succeeded',
        amount_minor: 1_000,
        status: 'pending',
        reason: 'Pending provider refund',
        created_at: '2026-05-15T10:00:00.000Z',
      },
      {
        id: 'refund-other',
        tenant_id: 'tenant-b',
        payment_id: 'payment-other',
        amount_minor: 200_000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-05-15T10:00:00.000Z',
      },
    ],
  });

  assert.equal(dashboard.totalRevenueCollectedMinor, 11_500);
  assert.equal(dashboard.currency, 'AED');
  assert.equal(dashboard.hasMixedCurrencies, false);
  assert.deepEqual(dashboard.excludedCurrencyCodes, []);
  assert.equal(dashboard.outstandingReceivablesMinor, 12_000);
  assert.equal(dashboard.openInvoiceCount, 2);
  assert.equal(dashboard.overdueInvoiceCount, 1);
  assert.equal(dashboard.collectionRate, 48.93617021276596);
  assert.equal(dashboard.totalRevenueCollected, 'AED\u00a0115.00');
  assert.equal(dashboard.outstandingReceivables, 'AED\u00a0120.00');

  assert.deepEqual(
    dashboard.revenuePerClient.map((row) => ({
      clientId: row.clientId,
      clientName: row.clientName,
      currency: row.currency,
      collectedMinor: row.collectedMinor,
      outstandingMinor: row.outstandingMinor,
      invoiceCount: row.invoiceCount,
      lastPaymentAt: row.lastPaymentAt,
    })),
    [
      {
        clientId: 'client-1',
        clientName: 'Acme DMCC',
        currency: 'AED',
        collectedMinor: 11_500,
        outstandingMinor: 5_000,
        invoiceCount: 3,
        lastPaymentAt: '2026-05-12T10:00:00.000Z',
      },
      {
        clientId: 'client-2',
        clientName: 'Beacon FZCO',
        currency: 'AED',
        collectedMinor: 0,
        outstandingMinor: 7_000,
        invoiceCount: 1,
        lastPaymentAt: null,
      },
    ],
  );

  assert.deepEqual(
    dashboard.recentFailedAttempts.map((row) => ({
      id: row.id,
      status: row.status,
      clientName: row.clientName,
      amountMinor: row.amountMinor,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
    })),
    [
      {
        id: 'payment-abandoned',
        status: 'abandoned',
        clientName: 'Beacon FZCO',
        amountMinor: 7_000,
        failureReason: 'Customer abandoned checkout',
        createdAt: '2026-05-20T10:00:00.000Z',
      },
      {
        id: 'payment-failed',
        status: 'failed',
        clientName: 'Acme DMCC',
        amountMinor: 5_000,
        failureReason: 'Insufficient funds',
        createdAt: '2026-05-19T10:00:00.000Z',
      },
    ],
  );
});

test('calculateProFinanceDashboard reports one currency without summing mixed minor units', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId,
    today: '2026-05-21',
    clients: [
      { id: 'client-aed', tenant_id: tenantId, company_name: 'AED Client' },
      { id: 'client-usd', tenant_id: tenantId, company_name: 'USD Client' },
    ],
    invoices: [
      {
        id: 'invoice-aed',
        tenant_id: tenantId,
        client_id: 'client-aed',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'paid',
        due_at: null,
        created_at: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 'invoice-usd',
        tenant_id: tenantId,
        client_id: 'client-usd',
        amount_minor: 99_000,
        currency: 'USD',
        status: 'open',
        due_at: '2026-05-20',
        created_at: '2026-05-02T08:00:00.000Z',
      },
      {
        id: 'invoice-usd-paid',
        tenant_id: tenantId,
        client_id: 'client-usd',
        amount_minor: 50_000,
        currency: 'USD',
        status: 'refunded',
        due_at: null,
        created_at: '2026-05-03T08:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'payment-aed',
        tenant_id: tenantId,
        invoice_id: 'invoice-aed',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-03T08:00:00.000Z',
        created_at: '2026-05-03T08:00:00.000Z',
      },
      {
        id: 'payment-usd-refunded',
        tenant_id: tenantId,
        invoice_id: 'invoice-usd-paid',
        amount_minor: 50_000,
        currency: 'USD',
        status: 'refunded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-05-04T08:00:00.000Z',
        created_at: '2026-05-04T08:00:00.000Z',
      },
    ],
    refunds: [
      {
        id: 'refund-usd',
        tenant_id: tenantId,
        payment_id: 'payment-usd-refunded',
        amount_minor: 50_000,
        status: 'succeeded',
        reason: 'Wrong currency should not affect AED report',
        created_at: '2026-05-05T08:00:00.000Z',
      },
    ],
  });

  assert.equal(dashboard.currency, 'AED');
  assert.equal(dashboard.hasMixedCurrencies, true);
  assert.deepEqual(dashboard.excludedCurrencyCodes, ['USD']);
  assert.equal(dashboard.totalRevenueCollectedMinor, 10_000);
  assert.equal(dashboard.outstandingReceivablesMinor, 0);
  assert.deepEqual(
    dashboard.revenuePerClient.map((row) => row.clientName),
    ['AED Client'],
  );
});

test('calculateProFinanceDashboard returns zero collection rate when there is no revenue or receivable', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId,
    today: '2026-05-21',
    clients: [],
    invoices: [],
    payments: [],
    refunds: [],
  });

  assert.equal(dashboard.collectionRate, 0);
  assert.equal(dashboard.totalRevenueCollectedMinor, 0);
  assert.equal(dashboard.outstandingReceivablesMinor, 0);
});

test('readProFinanceQueryData throws instead of hiding Supabase query failures', () => {
  assert.throws(
    () =>
      readProFinanceQueryData('payments', {
        data: null,
        error: { message: 'permission denied' },
      }),
    /Failed to load PRO finance payments: permission denied/,
  );
});
