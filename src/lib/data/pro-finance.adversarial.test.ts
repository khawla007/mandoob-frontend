import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProFinanceDashboard } from './pro-finance';

test('collected revenue only includes succeeded payments and refunds tied to eligible invoices', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId: 't1',
    today: '2026-09-02',
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    invoices: [
      {
        id: 'live',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'paid',
        due_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'draft',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 50_000,
        currency: 'AED',
        status: 'draft',
        due_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'void',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 40_000,
        currency: 'AED',
        status: 'void',
        due_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    payments: [
      {
        id: 'success',
        tenant_id: 't1',
        invoice_id: 'live',
        amount_minor: 10_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'failed',
        tenant_id: 't1',
        invoice_id: 'live',
        amount_minor: 9_000,
        currency: 'AED',
        status: 'failed',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'draft-payment',
        tenant_id: 't1',
        invoice_id: 'draft',
        amount_minor: 50_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'void-payment',
        tenant_id: 't1',
        invoice_id: 'void',
        amount_minor: 40_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    refunds: [
      {
        id: 'valid',
        tenant_id: 't1',
        payment_id: 'success',
        amount_minor: 2_000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'failed-parent',
        tenant_id: 't1',
        payment_id: 'failed',
        amount_minor: 9_000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'draft-parent',
        tenant_id: 't1',
        payment_id: 'draft-payment',
        amount_minor: 50_000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'void-parent',
        tenant_id: 't1',
        payment_id: 'void-payment',
        amount_minor: 40_000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  });
  assert.equal(dashboard.totalRevenueCollectedMinor, 8_000);
});

test('collected revenue preserves transitioned partial and full refund payment collections', () => {
  const common = {
    tenantId: 't1',
    today: '2026-09-02',
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    invoices: [
      {
        id: 'live',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 1000,
        currency: 'AED',
        status: 'paid',
        due_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  };
  const partial = calculateProFinanceDashboard({
    ...common,
    payments: [
      {
        id: 'p',
        tenant_id: 't1',
        invoice_id: 'live',
        amount_minor: 1000,
        currency: 'AED',
        status: 'partially_refunded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    refunds: [
      {
        id: 'r',
        tenant_id: 't1',
        payment_id: 'p',
        amount_minor: 250,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  });
  const full = calculateProFinanceDashboard({
    ...common,
    payments: [
      {
        id: 'p',
        tenant_id: 't1',
        invoice_id: 'live',
        amount_minor: 1000,
        currency: 'AED',
        status: 'refunded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    refunds: [
      {
        id: 'r',
        tenant_id: 't1',
        payment_id: 'p',
        amount_minor: 1000,
        status: 'succeeded',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  });
  assert.equal(partial.totalRevenueCollectedMinor, 750);
  assert.equal(full.totalRevenueCollectedMinor, 0);
});

test('collection rate uses the current Dubai business month for billed, payments, and refunds', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId: 't1',
    today: '2026-09-01',
    now: new Date('2026-09-01T00:00:00.000Z'),
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    invoices: [
      {
        id: 'aug',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 500,
        currency: 'AED',
        status: 'paid',
        due_at: null,
        created_at: '2026-08-31T19:59:59.000Z',
      },
      {
        id: 'sep',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 1_000,
        currency: 'AED',
        status: 'paid',
        due_at: null,
        created_at: '2026-08-31T20:00:00.000Z',
      },
      {
        id: 'draft',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 9_000,
        currency: 'AED',
        status: 'draft',
        due_at: null,
        created_at: '2026-08-31T20:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'p',
        tenant_id: 't1',
        invoice_id: 'sep',
        amount_minor: 1_000,
        currency: 'AED',
        status: 'succeeded',
        method: 'card',
        provider: 'tap',
        failure_reason: null,
        received_at: '2026-08-31T20:00:00.000Z',
        created_at: '2026-08-31T20:00:00.000Z',
      },
    ],
    refunds: [
      {
        id: 'old',
        tenant_id: 't1',
        payment_id: 'p',
        amount_minor: 100,
        status: 'succeeded',
        reason: null,
        created_at: '2026-08-31T19:59:59.000Z',
      },
      {
        id: 'new',
        tenant_id: 't1',
        payment_id: 'p',
        amount_minor: 250,
        status: 'succeeded',
        reason: null,
        created_at: '2026-08-31T20:00:00.000Z',
      },
    ],
  });

  assert.equal(dashboard.currentMonthBilledMinor, 1_000);
  assert.equal(dashboard.currentMonthNetCollectedMinor, 750);
  assert.equal(dashboard.collectionRate, 75);
});

test('analytics preserves invoice analytics when payment or refund reads are unavailable', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId: 't1',
    today: '2026-09-02',
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    invoices: [
      {
        id: 'open',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 100,
        currency: 'AED',
        status: 'open',
        due_at: '2026-09-01',
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    payments: [],
    refunds: [],
    paymentsAvailable: false,
    refundsAvailable: false,
  });
  assert.equal(dashboard.analyticsAvailability.collection, 'unavailable');
  assert.equal(dashboard.analyticsAvailability.paymentActivity, 'unavailable');
  assert.equal(dashboard.invoiceStatus[0]?.key, 'open');
  assert.equal(dashboard.aging[0]?.key, 'overdue');
});

test('aging uses Dubai business date and only eligible open invoices', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId: 't1',
    today: '2026-09-02',
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    payments: [],
    refunds: [],
    invoices: [
      {
        id: 'overdue',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 100,
        currency: 'AED',
        status: 'open',
        due_at: '2026-09-01',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'due',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 200,
        currency: 'AED',
        status: 'open',
        due_at: '2026-09-02',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'draft',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 999,
        currency: 'AED',
        status: 'draft',
        due_at: '2026-08-01',
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  });
  assert.deepEqual(
    dashboard.aging.map((row) => [row.key, row.amountMinor]),
    [
      ['overdue', 100],
      ['due_today', 200],
    ],
  );
});

test('aging buckets separate 7, 30, future, and missing-date boundaries', () => {
  const dashboard = calculateProFinanceDashboard({
    tenantId: 't1',
    today: '2026-09-02',
    companies: [{ id: 'c1', tenant_id: 't1', company_name: 'Assigned' }],
    payments: [],
    refunds: [],
    invoices: [
      {
        id: 'seven',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 7,
        currency: 'AED',
        status: 'open',
        due_at: '2026-09-09',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'thirty',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 30,
        currency: 'AED',
        status: 'open',
        due_at: '2026-10-02',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'future',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 31,
        currency: 'AED',
        status: 'open',
        due_at: '2026-10-03',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'missing',
        tenant_id: 't1',
        company_id: 'c1',
        amount_minor: 1,
        currency: 'AED',
        status: 'open',
        due_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  });
  assert.deepEqual(
    dashboard.aging.map((row) => row.key),
    ['within_7_days', 'within_30_days', 'future_over_30_days', 'missing_due_date'],
  );
});
