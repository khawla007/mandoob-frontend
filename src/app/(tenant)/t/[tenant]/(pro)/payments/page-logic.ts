import {
  parsePaymentSignalFilter,
  paymentSignalHref,
  type PaymentSignalView,
} from '@/lib/signal-studio-filters';

export type PaymentView = PaymentSignalView | 'all';

export function parsePaymentView(value: string | string[] | undefined): PaymentView {
  return parsePaymentSignalFilter({ view: value }).view;
}

export function paymentViewHref(slug: string, view: PaymentView): string {
  const base = `/t/${encodeURIComponent(slug)}/payments`;
  return view === 'all' ? base : paymentSignalHref(slug, { view });
}
