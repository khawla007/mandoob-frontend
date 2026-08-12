type Invoice = {
  id: string;
  tenant_id: string;
  currency: string;
  status: string;
  due_at: string | null;
  created_at: string;
};
type Payment = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  currency: string;
  status: string;
  amount_minor: number;
  received_at: string | null;
};
type Refund = {
  id: string;
  tenant_id: string;
  payment_id: string;
  status: string;
  amount_minor: number;
  created_at: string;
};

const BUSINESS_TIME_ZONE = 'Asia/Dubai';
const COLLECTED = new Set(['succeeded', 'refunded', 'partially_refunded']);

export function signalBusinessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function signalBusinessMonth(timestamp: string): string {
  return signalBusinessDate(new Date(timestamp)).slice(0, 7);
}

export function signalReportingCurrency(invoices: Invoice[], payments: Payment[]): string {
  const counts = new Map<string, number>();
  for (const row of [...invoices, ...payments])
    counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
  if (counts.has('AED')) return 'AED';
  return (
    Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'AED'
  );
}

export function addSignalDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function signalDaysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

export function classifyCollectionInvoiceIds(args: {
  tenantId: string;
  invoices: Invoice[];
  payments: Payment[];
  refunds: Refund[];
  today: string;
}) {
  const invoices = args.invoices.filter((row) => row.tenant_id === args.tenantId);
  const invoiceIds = new Set(invoices.map((row) => row.id));
  const payments = args.payments.filter(
    (row) => row.tenant_id === args.tenantId && invoiceIds.has(row.invoice_id),
  );
  const paymentById = new Map(payments.map((row) => [row.id, row]));
  const refunds = args.refunds.filter(
    (row) => row.tenant_id === args.tenantId && paymentById.has(row.payment_id),
  );
  const currency = signalReportingCurrency(invoices, payments);
  const month = args.today.slice(0, 7);
  const reporting = invoices.filter((row) => row.currency === currency);
  const billed = new Set(
    reporting
      .filter(
        (row) =>
          !['draft', 'void'].includes(row.status) && signalBusinessMonth(row.created_at) === month,
      )
      .map((row) => row.id),
  );
  const dueSoonDate = addSignalDays(args.today, 30);
  const dueSoon = new Set(
    reporting
      .filter(
        (row) =>
          row.status === 'open' &&
          row.due_at !== null &&
          row.due_at >= args.today &&
          row.due_at <= dueSoonDate,
      )
      .map((row) => row.id),
  );
  const overdue = new Set(
    reporting
      .filter((row) => row.status === 'open' && row.due_at !== null && row.due_at < args.today)
      .map((row) => row.id),
  );
  const net = new Map<string, number>();
  for (const row of payments) {
    if (
      row.currency === currency &&
      COLLECTED.has(row.status) &&
      row.received_at &&
      signalBusinessMonth(row.received_at) === month
    ) {
      net.set(row.invoice_id, (net.get(row.invoice_id) ?? 0) + row.amount_minor);
    }
  }
  for (const row of refunds) {
    const payment = paymentById.get(row.payment_id);
    if (
      row.status === 'succeeded' &&
      payment?.currency === currency &&
      signalBusinessMonth(row.created_at) === month
    ) {
      net.set(payment.invoice_id, (net.get(payment.invoice_id) ?? 0) - row.amount_minor);
    }
  }
  const paid = new Set(
    Array.from(net)
      .filter(([, amount]) => amount !== 0)
      .map(([id]) => id),
  );
  return { currency, billed, paid, dueSoon, overdue };
}
