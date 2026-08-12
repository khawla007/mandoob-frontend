'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';

type CollectionsWaterfallDataProps = {
  finance: ProDashboardData['finance'];
  tenantSlug: string;
  locale?: string;
};

export type CollectionsWaterfallProps = {
  canViewFinance: boolean;
} & WidgetStateProps<CollectionsWaterfallDataProps>;

type CollectionDatum = {
  key: string;
  label: string;
  valueMinor: number;
  fill: string;
  href: string;
  accessibleLabel: string;
};

function AccessibleBar(props: BarShapeProps) {
  const payload = props.payload as CollectionDatum;
  return (
    <a
      href={payload.href}
      aria-label={payload.accessibleLabel}
      className="focus-visible:outline-ring focus-visible:outline-2"
    >
      <rect
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        rx={8}
        ry={8}
        fill={payload.fill}
        className="cursor-pointer"
      />
    </a>
  );
}

export function CollectionsWaterfall(props: CollectionsWaterfallProps) {
  const { canViewFinance } = props;
  if (!canViewFinance) return null;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-chart-skeleton"
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
    return <WidgetMessage status={props} className="min-h-96" />;
  }

  const { finance, tenantSlug, locale } = props;
  const formatMoney = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: finance.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const paymentsHref = `/t/${encodeURIComponent(tenantSlug)}/payments`;
  const analyticsHref = `${paymentsHref}/analytics`;
  const input = [
    {
      key: 'billed',
      label: 'Billed',
      valueMinor: finance.billedMinor,
      fill: 'var(--signal-info)',
      href: paymentsHref,
    },
    {
      key: 'paid',
      label: 'Paid',
      valueMinor: finance.paidMinor,
      fill: 'var(--signal-success)',
      href: analyticsHref,
    },
    {
      key: 'due-soon',
      label: 'Due soon',
      valueMinor: finance.dueSoonMinor,
      fill: 'var(--signal-warning)',
      href: paymentsHref,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      valueMinor: finance.overdueMinor,
      fill: 'var(--signal-urgent)',
      href: analyticsHref,
    },
  ];
  const data: CollectionDatum[] = input.map((item) => ({
    ...item,
    accessibleLabel: `${item.label} bar, ${formatMoney.format(item.valueMinor / 100)}. Open ${item.href === analyticsHref ? 'payment analytics' : 'invoices'}.`,
  }));
  const total = data.reduce((sum, item) => sum + item.valueMinor, 0);
  if (total === 0) {
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: 'No invoices or collection activity exist for this period.',
          emptyAction: { label: 'Open payments', href: paymentsHref },
        }}
        className="min-h-96"
      />
    );
  }
  const config = {
    valueMinor: { label: 'Amount', color: 'var(--brand-accent)' },
  } satisfies ChartConfig;

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>Collections waterfall</CardTitle>
        <CardDescription>Billed, collected, approaching, and overdue value</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="aspect-auto h-64 w-full"
          role="group"
          aria-label={`Collections in ${finance.currency}: ${data.map((item) => `${item.label} ${formatMoney.format(item.valueMinor / 100)}`).join(', ')}. Each bar is a link to its valid finance view.`}
        >
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
            <Bar dataKey="valueMinor" maxBarSize={54} shape={AccessibleBar} />
          </BarChart>
        </ChartContainer>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.map((item) => (
            <a
              key={item.key}
              href={item.href}
              aria-label={item.accessibleLabel}
              className="hover:bg-muted focus-visible:ring-ring rounded-lg border p-2.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-muted-foreground flex items-center text-xs">{item.label}</span>
              <strong className="mt-1 block font-mono text-xs tabular-nums">
                {formatMoney.format(item.valueMinor / 100)}
              </strong>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
