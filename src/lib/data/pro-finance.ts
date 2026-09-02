import 'server-only';
import { formatMoney } from '@/lib/format/money';
import { signalBusinessDate, signalReportingCurrency } from './signal-finance';
import { loadAllRangePages } from './range-pagination';

export type ProFinanceInvoiceInput = {
  id: string;
  tenant_id: string;
  company_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  created_at: string;
};

export type ProFinancePaymentInput = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  method: string | null;
  provider: string;
  failure_reason: string | null;
  received_at: string | null;
  created_at: string;
};

export type ProFinanceRefundInput = {
  id: string;
  tenant_id: string;
  payment_id: string;
  amount_minor: number;
  status: string;
  reason: string | null;
  created_at: string;
};

export type ProFinanceCompanyInput = {
  id: string;
  tenant_id: string;
  company_name: string;
};

export type ProFinanceKpi = {
  label: string;
  value: string;
  helper: string;
};

export type ProFinanceCompanyRevenueRow = {
  companyId: string;
  companyName: string;
  currency: string;
  collected: string;
  collectedMinor: number;
  outstanding: string;
  outstandingMinor: number;
  invoiceCount: number;
  lastPaymentAt: string | null;
};

export type ProFinanceFailedAttemptRow = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  status: string;
  method: string | null;
  createdAt: string;
};

export type ProFinanceBreakdownRow = {
  key: string;
  count: number;
  amountMinor: number;
  currency: string;
};

export type ProFinanceDashboard = {
  currency: string;
  hasMixedCurrencies: boolean;
  excludedCurrencyCodes: string[];
  totalRevenueCollectedMinor: number;
  totalRevenueCollected: string;
  currentMonthBilledMinor: number;
  currentMonthNetCollectedMinor: number;
  outstandingReceivablesMinor: number;
  outstandingReceivables: string;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  collectionRate: number;
  collectionRateDisplay: string;
  kpis: ProFinanceKpi[];
  companyRevenue: ProFinanceCompanyRevenueRow[];
  invoiceStatus: ProFinanceBreakdownRow[];
  aging: ProFinanceBreakdownRow[];
  paymentMethods: ProFinanceBreakdownRow[];
  reconciliation: { state: 'unavailable'; reason: 'phase_3' };
  recentFailedAttempts: ProFinanceFailedAttemptRow[];
  analyticsAvailability: {
    collection: 'available' | 'unavailable';
    paymentActivity: 'available' | 'unavailable';
  };
};

const ELIGIBLE_INVOICE_STATUSES = new Set(['draft', 'void']);
const COLLECTED_PAYMENT_STATUSES = new Set(['succeeded', 'partially_refunded', 'refunded']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'abandoned']);

export function calculateProFinanceDashboard(args: {
  tenantId: string;
  invoices: ProFinanceInvoiceInput[];
  payments: ProFinancePaymentInput[];
  refunds: ProFinanceRefundInput[];
  companies: ProFinanceCompanyInput[];
  today?: string;
  now?: Date;
  paymentsAvailable?: boolean;
  refundsAvailable?: boolean;
}): ProFinanceDashboard {
  const clock = args.now ?? new Date();
  const today = args.today ?? businessDate(clock);
  const companies = args.companies.filter((row) => row.tenant_id === args.tenantId);
  const companyId = companies[0]?.id;
  const invoices = args.invoices.filter(
    (row) => row.tenant_id === args.tenantId && row.company_id === companyId,
  );
  const eligibleInvoices = invoices.filter((row) => !ELIGIBLE_INVOICE_STATUSES.has(row.status));
  const eligibleInvoiceIds = new Set(eligibleInvoices.map((row) => row.id));
  const payments = args.payments.filter(
    (row) => row.tenant_id === args.tenantId && eligibleInvoiceIds.has(row.invoice_id),
  );
  const paymentIds = new Set(payments.map((row) => row.id));
  const refunds = args.refunds.filter(
    (row) => row.tenant_id === args.tenantId && paymentIds.has(row.payment_id),
  );
  const invoiceById = new Map(eligibleInvoices.map((row) => [row.id, row]));
  const companyNameById = new Map(companies.map((row) => [row.id, row.company_name]));
  const paymentById = new Map(payments.map((row) => [row.id, row]));
  const currency = reportingCurrency(eligibleInvoices, payments);
  const currencyCodes = new Set([
    ...eligibleInvoices.map((row) => row.currency),
    ...payments.map((row) => row.currency),
  ]);
  const excludedCurrencyCodes = Array.from(currencyCodes)
    .filter((code) => code !== currency)
    .sort();

  const successfulPayments = payments.filter(
    (row) =>
      COLLECTED_PAYMENT_STATUSES.has(row.status) &&
      invoiceById.get(row.invoice_id)?.currency === row.currency,
  );
  const totalPaymentCollectedMinor = successfulPayments
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const succeededRefundsMinor = refunds
    .filter((row) => {
      const payment = paymentById.get(row.payment_id);
      return (
        row.status === 'succeeded' &&
        payment &&
        COLLECTED_PAYMENT_STATUSES.has(payment.status) &&
        payment.currency === currency &&
        invoiceById.get(payment.invoice_id)?.currency === payment.currency
      );
    })
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const totalRevenueCollectedMinor = totalPaymentCollectedMinor - succeededRefundsMinor;
  const currentMonth = dubaiMonthKey(clock);
  const currentMonthBilledMinor = eligibleInvoices
    .filter(
      (invoice) =>
        invoice.currency === currency && dubaiMonthKey(invoice.created_at) === currentMonth,
    )
    .reduce((sum, invoice) => sum + invoice.amount_minor, 0);
  const currentMonthPaymentsMinor = successfulPayments
    .filter(
      (payment) =>
        payment.currency === currency && dubaiMonthKey(payment.received_at) === currentMonth,
    )
    .reduce((sum, payment) => sum + payment.amount_minor, 0);
  const currentMonthRefundsMinor = refunds
    .filter((refund) => {
      const payment = paymentById.get(refund.payment_id);
      return (
        refund.status === 'succeeded' &&
        dubaiMonthKey(refund.created_at) === currentMonth &&
        payment !== undefined &&
        COLLECTED_PAYMENT_STATUSES.has(payment.status) &&
        payment.currency === currency &&
        invoiceById.get(payment.invoice_id)?.currency === payment.currency
      );
    })
    .reduce((sum, refund) => sum + refund.amount_minor, 0);
  const currentMonthNetCollectedMinor = currentMonthPaymentsMinor - currentMonthRefundsMinor;

  const reportingInvoices = eligibleInvoices.filter((row) => row.currency === currency);
  const reportingPayments = payments.filter(
    (row) =>
      row.currency === currency && invoiceById.get(row.invoice_id)?.currency === row.currency,
  );
  const openInvoices = reportingInvoices.filter((row) => row.status === 'open');
  const outstandingReceivablesMinor = openInvoices.reduce((sum, row) => sum + row.amount_minor, 0);
  const overdueInvoiceCount = openInvoices.filter(
    (row) => row.due_at !== null && row.due_at < today,
  ).length;
  const collectionRate =
    currentMonthBilledMinor > 0
      ? (currentMonthNetCollectedMinor / currentMonthBilledMinor) * 100
      : 0;
  const collectionRateDisplay = `${collectionRate.toFixed(1)}%`;

  const byCompany = new Map<
    string,
    {
      companyId: string;
      companyName: string;
      collectedMinor: number;
      outstandingMinor: number;
      invoiceCount: number;
      lastPaymentAt: string | null;
      currency: string;
    }
  >();

  const ensureCompany = (companyId: string, rowCurrency: string) => {
    const existing = byCompany.get(companyId);
    if (existing) return existing;
    const next = {
      companyId,
      companyName: companyNameById.get(companyId) ?? 'Unknown company',
      collectedMinor: 0,
      outstandingMinor: 0,
      invoiceCount: 0,
      lastPaymentAt: null,
      currency: rowCurrency,
    };
    byCompany.set(companyId, next);
    return next;
  };

  for (const invoice of reportingInvoices) {
    const row = ensureCompany(invoice.company_id, invoice.currency);
    row.invoiceCount += 1;
    if (invoice.status === 'open') row.outstandingMinor += invoice.amount_minor;
  }

  for (const payment of reportingPayments) {
    if (!COLLECTED_PAYMENT_STATUSES.has(payment.status)) continue;
    const invoice = invoiceById.get(payment.invoice_id);
    if (!invoice) continue;
    const row = ensureCompany(invoice.company_id, payment.currency);
    row.collectedMinor += payment.amount_minor;
    row.lastPaymentAt = latestIso(row.lastPaymentAt, payment.received_at ?? payment.created_at);
  }

  for (const refund of refunds) {
    if (refund.status !== 'succeeded') continue;
    const payment = paymentById.get(refund.payment_id);
    const invoice = payment ? invoiceById.get(payment.invoice_id) : null;
    if (
      !payment ||
      !invoice ||
      payment.currency !== currency ||
      !COLLECTED_PAYMENT_STATUSES.has(payment.status)
    ) {
      continue;
    }
    ensureCompany(invoice.company_id, payment.currency).collectedMinor -= refund.amount_minor;
  }

  const companyRevenue = Array.from(byCompany.values())
    .filter((row) => row.invoiceCount > 0 || row.collectedMinor !== 0 || row.outstandingMinor !== 0)
    .map((row) => ({
      companyId: row.companyId,
      companyName: row.companyName,
      currency: row.currency,
      collected: formatMoney(row.collectedMinor, row.currency),
      collectedMinor: row.collectedMinor,
      outstanding: formatMoney(row.outstandingMinor, row.currency),
      outstandingMinor: row.outstandingMinor,
      invoiceCount: row.invoiceCount,
      lastPaymentAt: row.lastPaymentAt,
    }))
    .sort(
      (a, b) => b.collectedMinor + b.outstandingMinor - (a.collectedMinor + a.outstandingMinor),
    );

  const recentFailedAttempts = payments
    .filter((row) => FAILED_PAYMENT_STATUSES.has(row.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((payment) => {
      return {
        id: payment.id,
        invoiceId: payment.invoice_id,
        amountMinor: payment.amount_minor,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        createdAt: payment.created_at,
      };
    });

  const invoiceStatus = breakdown(
    reportingInvoices,
    (invoice) => invoice.status,
    (invoice) => invoice.amount_minor,
    currency,
  );
  const paymentMethods = breakdown(
    reportingPayments,
    (payment) => payment.method ?? 'unknown',
    (payment) => payment.amount_minor,
    currency,
  );
  const aging = calculateAging(reportingInvoices, today, currency);

  return {
    currency,
    hasMixedCurrencies: excludedCurrencyCodes.length > 0,
    excludedCurrencyCodes,
    totalRevenueCollectedMinor,
    totalRevenueCollected: formatMoney(totalRevenueCollectedMinor, currency),
    currentMonthBilledMinor,
    currentMonthNetCollectedMinor,
    outstandingReceivablesMinor,
    outstandingReceivables: formatMoney(outstandingReceivablesMinor, currency),
    openInvoiceCount: openInvoices.length,
    overdueInvoiceCount,
    collectionRate,
    collectionRateDisplay,
    kpis: [
      {
        label: 'Revenue collected',
        value: formatMoney(totalRevenueCollectedMinor, currency),
        helper: 'successful payments minus refunds',
      },
      {
        label: 'Outstanding receivables',
        value: formatMoney(outstandingReceivablesMinor, currency),
        helper: `${openInvoices.length.toLocaleString('en-US')} open invoices`,
      },
      {
        label: 'Overdue invoices',
        value: overdueInvoiceCount.toLocaleString('en-US'),
        helper: 'open invoices past due',
      },
      {
        label: 'Collection rate',
        value: collectionRateDisplay,
        helper: 'collected vs collectible',
      },
    ],
    companyRevenue,
    invoiceStatus,
    aging,
    paymentMethods,
    reconciliation: { state: 'unavailable', reason: 'phase_3' },
    recentFailedAttempts,
    analyticsAvailability: {
      collection:
        args.paymentsAvailable === false || args.refundsAvailable === false
          ? 'unavailable'
          : 'available',
      paymentActivity: args.paymentsAvailable === false ? 'unavailable' : 'available',
    },
  };
}

function calculateAging(
  invoices: ProFinanceInvoiceInput[],
  today: string,
  currency: string,
): ProFinanceBreakdownRow[] {
  const rows = new Map<string, ProFinanceBreakdownRow>();
  for (const invoice of invoices) {
    if (invoice.status !== 'open') continue;
    const days = invoice.due_at ? calendarDayDifference(today, invoice.due_at) : null;
    const key =
      days === null
        ? 'missing_due_date'
        : days < 0
          ? 'overdue'
          : days === 0
            ? 'due_today'
            : days <= 7
              ? 'within_7_days'
              : days <= 30
                ? 'within_30_days'
                : 'future_over_30_days';
    const current = rows.get(key) ?? { key, count: 0, amountMinor: 0, currency };
    current.count += 1;
    current.amountMinor += invoice.amount_minor;
    rows.set(key, current);
  }
  const order = [
    'overdue',
    'due_today',
    'within_7_days',
    'within_30_days',
    'future_over_30_days',
    'missing_due_date',
  ];
  return [...rows.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function calendarDayDifference(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function breakdown<T>(
  rows: T[],
  keyFor: (row: T) => string,
  amountFor: (row: T) => number,
  currency: string,
): ProFinanceBreakdownRow[] {
  const values = new Map<string, ProFinanceBreakdownRow>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = values.get(key) ?? { key, count: 0, amountMinor: 0, currency };
    current.count += 1;
    current.amountMinor += amountFor(row);
    values.set(key, current);
  }
  return [...values.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function getProFinanceDashboard(
  tenantId: string,
  companyId: string,
): Promise<ProFinanceDashboard> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();

  const [invoiceResult, paymentResult, refundResult, companyResult] = await Promise.allSettled([
    loadAllRangePages('PRO finance invoices', (from, to) =>
      admin
        .from('invoices')
        .select('id, tenant_id, company_id, amount_minor, currency, status, due_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    loadAllRangePages('PRO finance payments', (from, to) =>
      admin
        .from('payments')
        .select(
          'id, tenant_id, invoice_id, amount_minor, currency, status, method, provider, failure_reason, received_at, created_at, invoice:invoices!payments_invoice_tenant_fk!inner(company_id)',
        )
        .eq('tenant_id', tenantId)
        .eq('invoice.company_id', companyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    loadAllRangePages('PRO finance refunds', (from, to) =>
      admin
        .from('refunds')
        .select(
          'id, tenant_id, payment_id, amount_minor, status, reason, created_at, payment:payments!refunds_payment_tenant_fk!inner(invoice:invoices!payments_invoice_tenant_fk!inner(company_id))',
        )
        .eq('tenant_id', tenantId)
        .eq('payment.invoice.company_id', companyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    loadAllRangePages('PRO finance companies', (from, to) =>
      admin
        .from('company_profiles')
        .select('id, tenant_id, company_name')
        .eq('tenant_id', tenantId)
        .eq('id', companyId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  if (invoiceResult.status === 'rejected') throw invoiceResult.reason;
  if (companyResult.status === 'rejected') throw companyResult.reason;
  const paymentsAvailable = paymentResult.status === 'fulfilled';
  const refundsAvailable = paymentsAvailable && refundResult.status === 'fulfilled';
  return calculateProFinanceDashboard({
    tenantId,
    invoices: invoiceResult.value as ProFinanceInvoiceInput[],
    payments: paymentsAvailable ? (paymentResult.value as ProFinancePaymentInput[]) : [],
    refunds: refundsAvailable ? (refundResult.value as ProFinanceRefundInput[]) : [],
    companies: companyResult.value as ProFinanceCompanyInput[],
    paymentsAvailable,
    refundsAvailable,
  });
}

export function readProFinanceQueryData<T>(
  label: string,
  result: { data: T[] | null; error: { message?: string } | null },
): T[] {
  if (result.error) {
    throw new Error(
      `Failed to load PRO finance ${label}: ${result.error.message ?? 'unknown error'}`,
    );
  }
  return result.data ?? [];
}

function latestIso(current: string | null, candidate: string): string {
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function businessDate(date = new Date()): string {
  return signalBusinessDate(date);
}

function reportingCurrency(
  invoices: ProFinanceInvoiceInput[],
  payments: ProFinancePaymentInput[],
): string {
  return signalReportingCurrency(invoices, payments);
}

function dubaiMonthKey(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}
