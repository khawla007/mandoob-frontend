import {
  parsePaymentSignalFilter,
  paymentSignalHref,
  type PaymentSignalView,
} from '@/lib/signal-studio-filters';

export type PaymentView = PaymentSignalView | 'all';

export type PaymentSearch = {
  view?: string | string[];
  date?: string | string[];
  period?: string | string[];
  eventTypes?: string | string[];
  before?: string | string[];
  beforeId?: string | string[];
};

export function parsePaymentSearch(search: PaymentSearch) {
  const filter = parsePaymentSignalFilter(search);
  const before = Array.isArray(search.before) ? search.before[0] : search.before;
  const beforeId = Array.isArray(search.beforeId) ? search.beforeId[0] : search.beforeId;
  const validDate = before && !Number.isNaN(new Date(before).getTime());
  const validId =
    beforeId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(beforeId);
  return { ...filter, cursor: validDate && validId ? { createdAt: before!, id: beforeId! } : null };
}

export function parsePaymentView(value: string | string[] | undefined): PaymentView {
  return parsePaymentSignalFilter({ view: value }).view;
}

export function parsePaymentPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function paymentViewHref(slug: string, view: PaymentView): string {
  const base = `/t/${encodeURIComponent(slug)}/payments`;
  return view === 'all' ? base : paymentSignalHref(slug, { view });
}

export function paymentPageHref(
  slug: string,
  filter: { view: PaymentView; date?: string; period?: 'morning' | 'afternoon' },
  page: number,
  cursor?: { createdAt: string; id: string } | null,
): string {
  const base =
    filter.view === 'due-date' && filter.date && filter.period
      ? paymentSignalHref(slug, {
          view: 'due-date',
          date: filter.date,
          period: filter.period,
        })
      : paymentViewHref(slug, filter.view);
  const url = new URL(base, 'https://mandoob.invalid');
  if (cursor) {
    url.searchParams.set('page', String(Math.max(1, Math.trunc(page))));
    url.searchParams.set('before', cursor.createdAt);
    url.searchParams.set('beforeId', cursor.id);
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
}
