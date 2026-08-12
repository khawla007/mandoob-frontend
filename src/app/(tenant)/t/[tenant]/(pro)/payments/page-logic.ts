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
};

export function parsePaymentSearch(search: PaymentSearch) {
  return parsePaymentSignalFilter(search);
}

export function parsePaymentView(value: string | string[] | undefined): PaymentView {
  return parsePaymentSignalFilter({ view: value }).view;
}

export function paymentViewHref(slug: string, view: PaymentView): string {
  const base = `/t/${encodeURIComponent(slug)}/payments`;
  return view === 'all' ? base : paymentSignalHref(slug, { view });
}

export function paymentPageHref(
  slug: string,
  filter: { view: PaymentView; date?: string; period?: 'morning' | 'afternoon' },
  page: number,
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
  url.searchParams.set('page', String(Math.max(1, Math.trunc(page))));
  return `${url.pathname}?${url.searchParams.toString()}`;
}
