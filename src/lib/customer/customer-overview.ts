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

export type CustomerInvoiceRow = OpenInvoiceInput & {
  label: string;
  dueDate: string | null;
};

export type CustomerInvoiceOverview = {
  openCount: number;
  totals:
    | { kind: 'complete'; values: ReturnType<typeof summarizeOpenInvoices> }
    | { kind: 'unavailable' };
  recent: CustomerInvoiceRow[];
  recentIsBounded: true;
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

export function buildCustomerInvoiceOverview(
  exactOpenCount: number,
  openRows: readonly CustomerInvoiceRow[],
  recent: readonly CustomerInvoiceRow[],
): CustomerInvoiceOverview {
  const complete = openRows.length === exactOpenCount;
  return {
    openCount: exactOpenCount,
    totals: complete
      ? { kind: 'complete', values: summarizeOpenInvoices(openRows) }
      : { kind: 'unavailable' },
    recent: recent.slice(0, 10),
    recentIsBounded: true,
  };
}

export type CustomerActionCandidate = {
  kind: 'document-request' | 'renewal' | 'invoice';
  id: string;
  href: string;
  dueDate: string | null;
  label?: string;
  actionable: boolean;
  status: string;
};

function actionPriority(action: CustomerActionCandidate, now: Date): number | null {
  if (!action.actionable) return null;
  if (action.kind === 'renewal' && ['completed', 'cancelled'].includes(action.status)) return null;
  if (action.kind === 'invoice' && action.status !== 'open') return null;
  const urgency = customerDeadlineUrgency(action.dueDate, now);
  if (urgency === 'overdue') return 0;
  if (urgency === 'due-today') return 1;
  if (urgency === 'due-soon') return 2;
  if (urgency === 'missing' && action.kind !== 'renewal') return 3;
  if (urgency === 'future' && action.kind !== 'renewal') return 4;
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

type ActionSources = {
  documents: CustomerWidgetState<readonly CustomerActionCandidate[]>;
  renewals: CustomerWidgetState<readonly CustomerActionCandidate[]>;
  invoices: CustomerWidgetState<readonly CustomerActionCandidate[]>;
};

export type CustomerActionState =
  | CustomerWidgetState<CustomerActionCandidate[]>
  | {
      kind: 'partial';
      value: CustomerActionCandidate[];
      sourceState: 'error' | 'unavailable';
    };

export function composeCustomerActions(
  sources: ActionSources,
  now = new Date(),
  limit = 6,
): CustomerActionState {
  const states = Object.values(sources);
  const candidates = states.flatMap((state) =>
    state.kind === 'ready' || state.kind === 'empty' ? [...state.value] : [],
  );
  const ranked = rankCustomerActions(candidates, now, limit);
  const sourceState = states.some((state) => state.kind === 'error')
    ? 'error'
    : states.some((state) => state.kind === 'unavailable')
      ? 'unavailable'
      : null;
  if (sourceState && ranked.length > 0) return { kind: 'partial', value: ranked, sourceState };
  if (sourceState) return { kind: sourceState };
  return ranked.length === 0 ? { kind: 'empty', value: ranked } : { kind: 'ready', value: ranked };
}

export const CUSTOMER_SIGNAL_ORDER = [
  'registration',
  'documents',
  'renewals',
  'invoices',
  'notifications',
] as const;

export type CustomerPortalRoute = 'overview' | 'documents' | 'meetings' | 'renewals';

export function buildCustomerPortalHref(tenantSlug: string, route: CustomerPortalRoute): string {
  const base = `/t/${encodeURIComponent(tenantSlug)}/portal`;
  const pathname = route === 'overview' ? base : `${base}/${route}`;
  return pathname;
}
