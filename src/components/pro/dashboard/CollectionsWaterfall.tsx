'use client';

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
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
        className="min-h-96 space-y-5 rounded-2xl border p-5"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error') {
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-96" />;
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
      fill: 'var(--signal-info)',
    },
    {
      key: 'paid',
      label: labels.paid,
      valueMinor: finance.paidMinor,
      fill: 'var(--signal-success)',
    },
    {
      key: 'due-soon',
      label: labels.dueSoon,
      valueMinor: finance.dueSoonMinor,
      fill: 'var(--signal-warning)',
    },
    {
      key: 'overdue',
      label: labels.overdue,
      valueMinor: finance.overdueMinor,
      fill: 'var(--signal-urgent)',
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
        className="min-h-96"
      />
    );
  }
  const config = {
    valueMinor: { label: labels.amount, color: 'var(--brand-accent)' },
  } satisfies ChartConfig;

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden="true">
          <BarChart
            data={data}
            margin={{ left: 2, right: 8, top: 8, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} strokeDasharray="4 5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={10} />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(value: number) => formatMoney.format(value / 100)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className="font-mono font-semibold tabular-nums">
                      {formatMoney.format(Number(value) / 100)}
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="valueMinor"
              maxBarSize={54}
              radius={[8, 8, 2, 2]}
              isAnimationActive={false}
            >
              {data.map((item) => (
                <Cell key={item.key} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div
          role="list"
          aria-label={signalLabel(labels.summary, { currency: finance.currency })}
          className="mt-5 space-y-3"
        >
          {data.map((item) => (
            <a
              key={item.key}
              href={item.href}
              aria-label={item.accessibleLabel}
              role="listitem"
              className="signal-collection-bar focus-visible:ring-ring group block rounded-md py-1 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                <span className="font-medium">{item.label}</span>
                <strong className="font-mono tabular-nums">
                  {formatMoney.format(item.valueMinor / 100)}
                </strong>
              </span>
              <span aria-hidden="true" className="bg-muted block h-8 overflow-hidden rounded-md">
                <span
                  className="block h-full min-w-1 rounded-md transition-[width,filter] group-hover:brightness-110 motion-reduce:transition-none"
                  style={{ width: `${(item.valueMinor / maximum) * 100}%`, background: item.fill }}
                />
              </span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
