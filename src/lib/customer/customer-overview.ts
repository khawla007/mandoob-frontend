export type CustomerWidgetState<T> =
  | { kind: 'ready'; value: T }
  | { kind: 'empty'; value: T }
  | { kind: 'error' }
  | { kind: 'unavailable' };

type WidgetSource = PromiseLike<unknown> | null;

export async function settleCustomerWidgets<T extends Record<string, WidgetSource>>(
  sources: T,
): Promise<{ [K in keyof T]: CustomerWidgetState<Awaited<Exclude<T[K], null>>> }> {
  const entries = Object.entries(sources);
  const settled = await Promise.allSettled(entries.map(([, source]) => source));
  return Object.fromEntries(
    entries.map(([key, source], index) => {
      if (source === null) return [key, { kind: 'unavailable' }];
      const result = settled[index]!;
      if (result.status === 'rejected') return [key, { kind: 'error' }];
      const empty =
        result.value === null || (Array.isArray(result.value) && result.value.length === 0);
      return [key, { kind: empty ? 'empty' : 'ready', value: result.value }];
    }),
  ) as { [K in keyof T]: CustomerWidgetState<Awaited<Exclude<T[K], null>>> };
}

export type CustomerDeadlineUrgency = 'missing' | 'overdue' | 'due-today' | 'due-soon' | 'future';

function dubaiBusinessDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

export function customerDeadlineUrgency(
  dueDate: string | null,
  now = new Date(),
  dueSoonDays = 30,
): CustomerDeadlineUrgency {
  if (!dueDate || !validDateOnly(dueDate)) return 'missing';
  const days = daysBetween(dubaiBusinessDate(now), dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  return days <= dueSoonDays ? 'due-soon' : 'future';
}

export type OpenInvoiceInput = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
};

export function summarizeOpenInvoices(invoices: readonly OpenInvoiceInput[]) {
  const totals = new Map<string, { currency: string; amountMinor: number; count: number }>();
  for (const invoice of invoices) {
    if (invoice.status !== 'open') continue;
    const currency = invoice.currency.toUpperCase();
    const current = totals.get(currency) ?? { currency, amountMinor: 0, count: 0 };
    current.amountMinor += invoice.amountMinor;
    current.count += 1;
    totals.set(currency, current);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export type CustomerActionCandidate = {
  kind: 'document-request' | 'renewal' | 'invoice';
  id: string;
  href: string;
  dueDate: string | null;
  label?: string;
};

function actionPriority(action: CustomerActionCandidate, now: Date): number | null {
  if (action.kind === 'document-request') return 0;
  if (action.kind === 'invoice') return 3;
  const urgency = customerDeadlineUrgency(action.dueDate, now);
  if (urgency === 'overdue' || urgency === 'due-today') return 1;
  if (urgency === 'due-soon') return 2;
  return null;
}

export function rankCustomerActions(
  candidates: readonly CustomerActionCandidate[],
  now = new Date(),
  limit = 6,
): CustomerActionCandidate[] {
  return candidates
    .map((action) => ({ action, priority: actionPriority(action, now) }))
    .filter(
      (entry): entry is { action: CustomerActionCandidate; priority: number } =>
        entry.priority !== null,
    )
    .toSorted(
      (a, b) =>
        a.priority - b.priority ||
        (a.action.dueDate ?? '9999-12-31').localeCompare(b.action.dueDate ?? '9999-12-31') ||
        a.action.id.localeCompare(b.action.id),
    )
    .slice(0, Math.max(0, limit))
    .map(({ action }) => action);
}

export const CUSTOMER_SIGNAL_ORDER = [
  'registration',
  'documents',
  'renewals',
  'invoices',
  'notifications',
] as const;

export type CustomerPortalRoute =
  | 'overview'
  | 'company'
  | 'documents'
  | 'employees'
  | 'meetings'
  | 'renewals'
  | 'payments'
  | 'pro'
  | 'settings';

export function buildCustomerPortalHref(
  tenantSlug: string,
  route: CustomerPortalRoute,
  query?: Record<string, string | number | undefined>,
): string {
  const base = `/t/${encodeURIComponent(tenantSlug)}/portal`;
  const pathname = route === 'overview' ? base : `${base}/${route}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
