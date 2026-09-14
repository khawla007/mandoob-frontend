import { z } from 'zod';

import { signalDaysBetween } from '@/lib/data/signal-finance';

export type CustomerInvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'refunded'
  | 'partially_refunded';
export type CustomerFinanceFilter = 'all' | 'open' | 'overdue' | 'paid' | 'cancelled';
export type CustomerFinanceSearch = {
  status: CustomerFinanceFilter;
  page: number;
  invoice: string | null;
};

const searchSchema = z.object({
  status: z.enum(['all', 'open', 'overdue', 'paid', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  invoice: z.string().uuid().optional(),
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCustomerFinanceSearch(
  input: Record<string, string | string[] | undefined>,
): CustomerFinanceSearch {
  const parsed = searchSchema.safeParse({
    status: first(input.status),
    page: first(input.page),
    invoice: first(input.invoice),
  });
  const value = parsed.success ? parsed.data : {};
  return { status: value.status ?? 'all', page: value.page ?? 1, invoice: value.invoice ?? null };
}

export function customerFinanceHref(slug: string, search: CustomerFinanceSearch) {
  const params = new URLSearchParams();
  if (search.status !== 'all') params.set('status', search.status);
  if (search.invoice) params.set('invoice', search.invoice);
  else if (search.page > 1) params.set('page', String(search.page));
  const query = params.toString();
  return `/t/${encodeURIComponent(slug)}/portal/payments${query ? `?${query}` : ''}`;
}

export type CustomerInvoiceDbRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  customer_profile_id: string | null;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};
export type CustomerInvoice = {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  status: CustomerInvoiceStatus;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

const statuses = new Set<CustomerInvoiceStatus>([
  'draft',
  'open',
  'paid',
  'void',
  'refunded',
  'partially_refunded',
]);

export function normaliseCustomerInvoice(
  row: Partial<CustomerInvoiceDbRow>,
): CustomerInvoice | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.label !== 'string' ||
    !Number.isSafeInteger(row.amount_minor) ||
    (row.amount_minor ?? -1) < 0 ||
    typeof row.currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(row.currency) ||
    typeof row.status !== 'string' ||
    !statuses.has(row.status as CustomerInvoiceStatus) ||
    typeof row.created_at !== 'string' ||
    Number.isNaN(new Date(row.created_at).getTime())
  )
    return null;
  return {
    id: row.id,
    label: row.label,
    amountMinor: row.amount_minor!,
    currency: row.currency,
    status: row.status as CustomerInvoiceStatus,
    dueAt: strictDate(row.due_at ?? null) ? row.due_at! : null,
    paidAt: row.paid_at && !Number.isNaN(new Date(row.paid_at).getTime()) ? row.paid_at : null,
    createdAt: row.created_at,
  };
}

export type CustomerInvoiceDueState =
  | 'overdue'
  | 'due-today'
  | 'due-soon'
  | 'future'
  | 'missing'
  | 'settled';
export function customerInvoiceDueState(
  status: CustomerInvoiceStatus,
  dueAt: string | null,
  today: string,
): CustomerInvoiceDueState {
  if (status !== 'open') return 'settled';
  if (!strictDate(dueAt)) return 'missing';
  const days = signalDaysBetween(today, dueAt);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  return days <= 30 ? 'due-soon' : 'future';
}

function strictDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type CustomerProviderState = 'configured' | 'unavailable' | 'error';
export function isCustomerInvoicePayable(
  status: CustomerInvoiceStatus,
  provider: CustomerProviderState,
  initiation: 'available' | 'unavailable' = 'unavailable',
) {
  return status === 'open' && provider === 'configured' && initiation === 'available';
}

export type CustomerPaymentState =
  | 'success'
  | 'pending'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'refunded';
export function paymentAttemptState(status: string): CustomerPaymentState | null {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'declined';
  if (status === 'abandoned' || status === 'cancelled') return 'cancelled';
  if (status === 'voided') return 'cancelled';
  if (status === 'expired') return 'expired';
  if (status === 'refunded' || status === 'partially_refunded') return 'refunded';
  if (status === 'initiated' || status === 'pending') return 'pending';
  return null;
}

export function totalsByCurrency(
  invoices: Pick<CustomerInvoice, 'status' | 'amountMinor' | 'currency'>[],
): { currency: string; amountMinor: number }[] | null {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.status !== 'open') continue;
    const total = (totals.get(invoice.currency) ?? 0) + invoice.amountMinor;
    if (!Number.isSafeInteger(total)) return null;
    totals.set(invoice.currency, total);
  }
  return [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}
