import type { ProInvoiceRow } from '@/lib/data/invoices';

export type PaymentView = 'all' | 'billed' | 'paid' | 'due-soon' | 'overdue';

const PAYMENT_VIEWS = new Set<PaymentView>(['all', 'billed', 'paid', 'due-soon', 'overdue']);
const SETTLED_INVOICE_STATUSES = new Set(['paid', 'refunded', 'partially_refunded']);
const NON_BILLED_STATUSES = new Set(['draft', 'void']);
const BUSINESS_TIME_ZONE = 'Asia/Dubai';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePaymentView(value: string | string[] | undefined): PaymentView {
  const candidate = first(value);
  return candidate && PAYMENT_VIEWS.has(candidate as PaymentView)
    ? (candidate as PaymentView)
    : 'all';
}

export function paymentBusinessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timestampMonth(value: string | null): string | null {
  return value ? paymentBusinessDate(new Date(value)).slice(0, 7) : null;
}

export function filterInvoicesForPaymentView(
  rows: ProInvoiceRow[],
  view: PaymentView,
  today: string,
): ProInvoiceRow[] {
  if (view === 'all') return rows;
  const month = today.slice(0, 7);
  const dueSoon = addDays(today, 30);

  return rows.filter((row) => {
    if (view === 'billed') {
      return !NON_BILLED_STATUSES.has(row.status) && timestampMonth(row.createdAt) === month;
    }
    if (view === 'paid') {
      return SETTLED_INVOICE_STATUSES.has(row.status) && timestampMonth(row.paidAt) === month;
    }
    if (view === 'due-soon') {
      return (
        row.status === 'open' && row.dueAt !== null && row.dueAt >= today && row.dueAt <= dueSoon
      );
    }
    return row.status === 'open' && row.dueAt !== null && row.dueAt < today;
  });
}

export function paymentViewHref(slug: string, view: PaymentView): string {
  const base = `/t/${encodeURIComponent(slug)}/payments`;
  return view === 'all' ? base : `${base}?${new URLSearchParams({ view }).toString()}`;
}
