import 'server-only';
import { formatMoney } from '@/lib/format/money';

export type ProFinanceInvoiceInput = {
  id: string;
  tenant_id: string;
  client_id: string;
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

export type ProFinanceClientInput = {
  id: string;
  tenant_id: string;
  company_name: string;
};

export type ProFinanceKpi = {
  label: string;
  value: string;
  helper: string;
};

export type ProFinanceClientRevenueRow = {
  clientId: string;
  clientName: string;
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
  clientId: string | null;
  clientName: string;
  amount: string;
  amountMinor: number;
  currency: string;
  status: string;
  failureReason: string | null;
  provider: string;
  method: string | null;
  createdAt: string;
};

export type ProFinanceDashboard = {
  currency: string;
  hasMixedCurrencies: boolean;
  excludedCurrencyCodes: string[];
  totalRevenueCollectedMinor: number;
  totalRevenueCollected: string;
  outstandingReceivablesMinor: number;
  outstandingReceivables: string;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  collectionRate: number;
  collectionRateDisplay: string;
  kpis: ProFinanceKpi[];
  revenuePerClient: ProFinanceClientRevenueRow[];
  recentFailedAttempts: ProFinanceFailedAttemptRow[];
};

const COLLECTED_PAYMENT_STATUSES = new Set(['succeeded', 'refunded', 'partially_refunded']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'abandoned']);
const DEFAULT_CURRENCY = 'AED';
const BUSINESS_TIME_ZONE = 'Asia/Dubai';

export function calculateProFinanceDashboard(args: {
  tenantId: string;
  invoices: ProFinanceInvoiceInput[];
  payments: ProFinancePaymentInput[];
  refunds: ProFinanceRefundInput[];
  clients: ProFinanceClientInput[];
  today?: string;
}): ProFinanceDashboard {
  const today = args.today ?? businessDate();
  const clients = args.clients.filter((row) => row.tenant_id === args.tenantId);
  const invoices = args.invoices.filter((row) => row.tenant_id === args.tenantId);
  const payments = args.payments.filter((row) => row.tenant_id === args.tenantId);
  const refunds = args.refunds.filter((row) => row.tenant_id === args.tenantId);
  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const clientNameById = new Map(clients.map((row) => [row.id, row.company_name]));
  const paymentById = new Map(payments.map((row) => [row.id, row]));
  const currency = reportingCurrency(invoices, payments);
  const currencyCodes = new Set([
    ...invoices.map((row) => row.currency),
    ...payments.map((row) => row.currency),
  ]);
  const excludedCurrencyCodes = Array.from(currencyCodes)
    .filter((code) => code !== currency)
    .sort();

  const totalPaymentCollectedMinor = payments
    .filter((row) => row.currency === currency && COLLECTED_PAYMENT_STATUSES.has(row.status))
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const succeededRefundsMinor = refunds
    .filter((row) => {
      const payment = paymentById.get(row.payment_id);
      return row.status === 'succeeded' && payment?.currency === currency;
    })
    .reduce((sum, row) => sum + row.amount_minor, 0);
  const totalRevenueCollectedMinor = totalPaymentCollectedMinor - succeededRefundsMinor;

  const reportingInvoices = invoices.filter((row) => row.currency === currency);
  const reportingPayments = payments.filter((row) => row.currency === currency);
  const openInvoices = reportingInvoices.filter((row) => row.status === 'open');
  const outstandingReceivablesMinor = openInvoices.reduce((sum, row) => sum + row.amount_minor, 0);
  const overdueInvoiceCount = openInvoices.filter(
    (row) => row.due_at !== null && row.due_at < today,
  ).length;
  const denominator = totalRevenueCollectedMinor + outstandingReceivablesMinor;
  const collectionRate = denominator > 0 ? (totalRevenueCollectedMinor / denominator) * 100 : 0;
  const collectionRateDisplay = `${collectionRate.toFixed(1)}%`;

  const perClient = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      collectedMinor: number;
      outstandingMinor: number;
      invoiceCount: number;
      lastPaymentAt: string | null;
      currency: string;
    }
  >();

  const ensureClient = (clientId: string, rowCurrency: string) => {
    const existing = perClient.get(clientId);
    if (existing) return existing;
    const next = {
      clientId,
      clientName: clientNameById.get(clientId) ?? 'Unknown client',
      collectedMinor: 0,
      outstandingMinor: 0,
      invoiceCount: 0,
      lastPaymentAt: null,
      currency: rowCurrency,
    };
    perClient.set(clientId, next);
    return next;
  };

  for (const invoice of reportingInvoices) {
    const row = ensureClient(invoice.client_id, invoice.currency);
    row.invoiceCount += 1;
    if (invoice.status === 'open') row.outstandingMinor += invoice.amount_minor;
  }

  for (const payment of reportingPayments) {
    if (!COLLECTED_PAYMENT_STATUSES.has(payment.status)) continue;
    const invoice = invoiceById.get(payment.invoice_id);
    if (!invoice) continue;
    const row = ensureClient(invoice.client_id, payment.currency);
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
    ensureClient(invoice.client_id, payment.currency).collectedMinor -= refund.amount_minor;
  }

  const revenuePerClient = Array.from(perClient.values())
    .filter((row) => row.invoiceCount > 0 || row.collectedMinor !== 0 || row.outstandingMinor !== 0)
    .map((row) => ({
      clientId: row.clientId,
      clientName: row.clientName,
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
      const invoice = invoiceById.get(payment.invoice_id);
      const clientId = invoice?.client_id ?? null;
      return {
        id: payment.id,
        invoiceId: payment.invoice_id,
        clientId,
        clientName: clientId
          ? (clientNameById.get(clientId) ?? 'Unknown client')
          : 'Unknown client',
        amount: formatMoney(payment.amount_minor, payment.currency),
        amountMinor: payment.amount_minor,
        currency: payment.currency,
        status: payment.status,
        failureReason: payment.failure_reason,
        provider: payment.provider,
        method: payment.method,
        createdAt: payment.created_at,
      };
    });

  return {
    currency,
    hasMixedCurrencies: excludedCurrencyCodes.length > 0,
    excludedCurrencyCodes,
    totalRevenueCollectedMinor,
    totalRevenueCollected: formatMoney(totalRevenueCollectedMinor, currency),
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
    revenuePerClient,
    recentFailedAttempts,
  };
}

export async function getProFinanceDashboard(tenantId: string): Promise<ProFinanceDashboard> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();

  const [invoices, payments, refunds, clients] = await Promise.all([
    admin
      .from('invoices')
      .select('id, tenant_id, client_id, amount_minor, currency, status, due_at, created_at')
      .eq('tenant_id', tenantId),
    admin
      .from('payments')
      .select(
        'id, tenant_id, invoice_id, amount_minor, currency, status, method, provider, failure_reason, received_at, created_at',
      )
      .eq('tenant_id', tenantId),
    admin
      .from('refunds')
      .select('id, tenant_id, payment_id, amount_minor, status, reason, created_at')
      .eq('tenant_id', tenantId),
    admin.from('clients').select('id, tenant_id, company_name').eq('tenant_id', tenantId),
  ]);

  return calculateProFinanceDashboard({
    tenantId,
    invoices: readProFinanceQueryData('invoices', invoices) as ProFinanceInvoiceInput[],
    payments: readProFinanceQueryData('payments', payments) as ProFinancePaymentInput[],
    refunds: readProFinanceQueryData('refunds', refunds) as ProFinanceRefundInput[],
    clients: readProFinanceQueryData('clients', clients) as ProFinanceClientInput[],
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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function reportingCurrency(
  invoices: ProFinanceInvoiceInput[],
  payments: ProFinancePaymentInput[],
): string {
  const counts = new Map<string, number>();
  for (const row of invoices) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
  for (const row of payments) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
  if (counts.has(DEFAULT_CURRENCY)) return DEFAULT_CURRENCY;
  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    DEFAULT_CURRENCY
  );
}
