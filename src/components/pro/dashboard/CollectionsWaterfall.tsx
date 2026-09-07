import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import { paymentSignalHref } from '@/lib/signal-studio-filters';
import { signalLabel } from './widget-format';
import {
  WidgetLoading,
  WidgetMessage,
  type WidgetBaseLabels,
  type WidgetStateProps,
} from './widget-state';

type CollectionsWaterfallDataProps = {
  finance: ProDashboardData['finance'];
  tenantSlug: string;
};

export type CollectionsWaterfallLabels = WidgetBaseLabels & {
  billed: string;
  paid: string;
  dueSoon: string;
  overdue: string;
  barLabel: string;
  empty: string;
  openPayments: string;
  amount: string;
  title: string;
  description: string;
  summary: string;
};

export type CollectionsWaterfallProps = {
  canViewFinance: boolean;
} & WidgetStateProps<CollectionsWaterfallDataProps, CollectionsWaterfallLabels>;

type CollectionDatum = {
  key: string;
  label: string;
  valueMinor: number;
  fill: string;
  top: string;
  bottom: string;
  href: string;
  accessibleLabel: string;
};

export function CollectionsWaterfall(props: CollectionsWaterfallProps) {
  const { labels } = props;
  const { canViewFinance } = props;
  if (!canViewFinance) return null;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-chart-skeleton"
        label={labels.loading}
        className="min-h-36 space-y-3 rounded-xl border p-3"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="grid h-24 grid-cols-4 items-end gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error') {
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-36" />;
  }

  const { finance, tenantSlug, locale } = props;
  const formatMoney = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: finance.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const paymentsHref = `/t/${encodeURIComponent(tenantSlug)}/payments`;
  const input = [
    {
      key: 'billed',
      label: labels.billed,
      valueMinor: finance.billedMinor,
      fill: 'var(--signal-success)',
      top: 'var(--signal-waterfall-success-start)',
      bottom: 'var(--signal-waterfall-success-end)',
    },
    {
      key: 'paid',
      label: labels.paid,
      valueMinor: finance.paidMinor,
      fill: 'var(--signal-coral)',
      top: 'var(--signal-waterfall-coral-start)',
      bottom: 'var(--signal-waterfall-coral-end)',
    },
    {
      key: 'due-soon',
      label: labels.dueSoon,
      valueMinor: finance.dueSoonMinor,
      fill: 'var(--signal-warning)',
      top: 'var(--signal-waterfall-warning-start)',
      bottom: 'var(--signal-waterfall-warning-end)',
    },
    {
      key: 'overdue',
      label: labels.overdue,
      valueMinor: finance.overdueMinor,
      fill: 'var(--signal-urgent)',
      top: 'var(--signal-waterfall-urgent-start)',
      bottom: 'var(--signal-waterfall-urgent-end)',
    },
  ];
  const data: CollectionDatum[] = input.map((item) => ({
    ...item,
    href: paymentSignalHref(tenantSlug, {
      view: item.key as 'billed' | 'paid' | 'due-soon' | 'overdue',
    }),
    accessibleLabel: signalLabel(labels.barLabel, {
      category: item.label,
      amount: formatMoney.format(item.valueMinor / 100),
    }),
  }));
  const total = data.reduce((sum, item) => sum + item.valueMinor, 0);
  const maximum = Math.max(1, ...data.map((item) => item.valueMinor));
  if (total === 0) {
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: labels.empty,
          emptyAction: { label: labels.openPayments, href: paymentsHref },
        }}
        retryLabel={labels.retry}
        className="min-h-36"
      />
    );
  }
  return (
    <Card className="signal-panel signal-waterfall">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul
          aria-label={signalLabel(labels.summary, { currency: finance.currency })}
          className="signal-waterfall__columns"
        >
          {data.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                aria-label={item.accessibleLabel}
                className="signal-waterfall__column focus-visible:ring-ring group focus-visible:ring-2 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="signal-waterfall__bar"
                  style={{
                    height: `${Math.max(14, (item.valueMinor / maximum) * 82)}%`,
                    background: `linear-gradient(180deg, ${item.top}, ${item.bottom})`,
                  }}
                >
                  <strong className="font-mono tabular-nums">
                    {formatMoney.format(item.valueMinor / 100)}
                  </strong>
                </span>
                <small>{item.label}</small>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
