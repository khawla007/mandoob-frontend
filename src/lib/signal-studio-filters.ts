export const applicationOpenStatuses = [
  'documents_pending',
  'draft',
  'ready_to_submit',
  'submitted',
  'authority_review',
  'approved',
] as const;
export const renewalSignalTypes = ['license', 'visa', 'eid', 'ejari'] as const;
export const renewalSignalDays = [7, 30, 60, 90] as const;
export const paymentSignalViews = ['billed', 'paid', 'due-soon', 'overdue', 'due-date'] as const;

export type ApplicationSignalFilter =
  | { view: 'open' }
  | { date: string; period: 'morning' | 'afternoon'; eventTypes: 'case' };
export type RenewalSignalFilter = {
  tab: 'active';
  type?: (typeof renewalSignalTypes)[number];
  days?: (typeof renewalSignalDays)[number];
  renewalId?: string;
  date?: string;
  period?: 'morning' | 'afternoon';
};
export type PaymentSignalView = (typeof paymentSignalViews)[number];
export type ApplicationScope = { ownerId?: string; serviceType?: string };

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const isUuid = (value: string | undefined) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
const isDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
};

export function parseApplicationSignalFilter(search: Search): Partial<ApplicationSignalFilter> {
  if (first(search.view) === 'open') return { view: 'open' };
  const date = first(search.date);
  const period = first(search.period);
  if (
    isDate(date) &&
    (period === 'morning' || period === 'afternoon') &&
    first(search.eventTypes) === 'case'
  ) {
    return { date: date!, period, eventTypes: 'case' };
  }
  return {};
}

export function parseRenewalSignalFilter(search: Search): RenewalSignalFilter {
  const type = first(search.type);
  const rawDays = Number(first(search.days));
  const renewalId = first(search.target) ?? first(search.renewal);
  return {
    tab: 'active',
    ...(renewalSignalTypes.includes(type as never)
      ? { type: type as RenewalSignalFilter['type'] }
      : {}),
    ...(renewalSignalDays.includes(rawDays as never)
      ? { days: rawDays as RenewalSignalFilter['days'] }
      : {}),
    ...(isUuid(renewalId) ? { renewalId } : {}),
    ...(isDate(first(search.date)) &&
    (first(search.period) === 'morning' || first(search.period) === 'afternoon') &&
    first(search.eventTypes) === 'renewal'
      ? {
          date: first(search.date)!,
          period: first(search.period) as 'morning' | 'afternoon',
        }
      : {}),
  };
}

export function parsePaymentSignalFilter(search: Search): {
  view: PaymentSignalView | 'all';
  date?: string;
  period?: 'morning' | 'afternoon';
} {
  const view = first(search.view);
  const date = first(search.date);
  const period = first(search.period);
  const deadline =
    view === 'due-date' &&
    isDate(date) &&
    (period === 'morning' || period === 'afternoon') &&
    first(search.eventTypes) === 'invoice';
  const parsedView =
    paymentSignalViews.includes(view as never) && (view !== 'due-date' || deadline)
      ? (view as PaymentSignalView)
      : 'all';
  return {
    view: parsedView,
    ...(parsedView === 'due-date' && deadline ? { date, period } : {}),
  };
}

function href(slug: string, target: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `/t/${encodeURIComponent(slug)}/${target}?${query.toString()}`;
}

function applicationScopeParams(scope: ApplicationScope): Record<string, string> {
  return {
    ...(scope.ownerId ? { owner: scope.ownerId } : {}),
    ...(scope.serviceType ? { serviceType: scope.serviceType } : {}),
  };
}

export function applicationSignalHref(
  slug: string,
  filter: ApplicationSignalFilter,
  scope: ApplicationScope = {},
): string {
  return href(slug, 'applications', { ...filter, ...applicationScopeParams(scope) });
}

export function withApplicationScope(path: string, scope: ApplicationScope): string {
  if (!scope.ownerId && !scope.serviceType) return path;
  const url = new URL(path, 'https://mandoob.invalid');
  for (const [key, value] of Object.entries(applicationScopeParams(scope))) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function applicationDeadlineQuery(date: string, period: 'morning' | 'afternoon'): string {
  const startDate = new Date(`${date}T00:00:00.000Z`);
  if (period === 'morning') startDate.setUTCDate(startDate.getUTCDate() - 1);
  startDate.setUTCHours(period === 'morning' ? 20 : 8);
  const endDate = new Date(startDate);
  endDate.setUTCHours(endDate.getUTCHours() + 12);
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  return `and(sla_due_at.gte.${start},sla_due_at.lt.${end}),and(sla_due_at.is.null,due_at.gte.${start},due_at.lt.${end})`;
}

export function renewalSignalHref(slug: string, filter: RenewalSignalFilter): string {
  const params: Record<string, string> = { tab: filter.tab };
  if (filter.type) params.type = filter.type;
  if (filter.days) params.days = String(filter.days);
  if (filter.renewalId) params.target = filter.renewalId;
  if (filter.date && filter.period) {
    params.date = filter.date;
    params.period = filter.period;
    params.eventTypes = 'renewal';
  }
  return href(slug, 'renewals', params);
}

export function paymentSignalHref(
  slug: string,
  filter: { view: PaymentSignalView; date?: string; period?: 'morning' | 'afternoon' },
): string {
  return href(slug, 'payments', {
    view: filter.view,
    ...(filter.date && filter.period
      ? { date: filter.date, period: filter.period, eventTypes: 'invoice' }
      : {}),
  });
}
