'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import { dashboardHref } from './dashboard-links';
import {
  READY_WIDGET_STATUS,
  WidgetMessage,
  WidgetSkeleton,
  type WidgetStatus,
} from './widget-state';

export type CollectionsWaterfallProps = {
  finance: ProDashboardData['finance'];
  tenantSlug: string;
  canViewFinance: boolean;
  locale?: string;
  status?: WidgetStatus;
};

export function CollectionsWaterfall({
  finance,
  tenantSlug,
  canViewFinance,
  locale,
  status = READY_WIDGET_STATUS,
}: CollectionsWaterfallProps) {
  if (!canViewFinance) return null;
  if (status.kind === 'loading')
    return <WidgetSkeleton rows={4} className="min-h-96 rounded-2xl border p-5" />;
  if (status.kind !== 'ready') return <WidgetMessage status={status} className="min-h-96" />;

  const formatMoney = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: finance.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const data = [
    { key: 'billed', label: 'Billed', valueMinor: finance.billedMinor, fill: 'var(--signal-info)' },
    { key: 'paid', label: 'Paid', valueMinor: finance.paidMinor, fill: 'var(--signal-success)' },
    {
      key: 'due-soon',
      label: 'Due soon',
      valueMinor: finance.dueSoonMinor,
      fill: 'var(--signal-warning)',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      valueMinor: finance.overdueMinor,
      fill: 'var(--signal-urgent)',
    },
  ];
  const total = data.reduce((sum, item) => sum + item.valueMinor, 0);
  if (total === 0) {
    return (
      <WidgetMessage
        status={{ kind: 'empty', message: 'No collection activity for this period.' }}
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
          role="img"
          aria-label={`Collections in ${finance.currency}: ${data.map((item) => `${item.label} ${formatMoney.format(item.valueMinor / 100)}`).join(', ')}.`}
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
            <Bar dataKey="valueMinor" radius={[8, 8, 2, 2]} maxBarSize={54}>
              {data.map((item) => (
                <Cell key={item.key} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.map((item) => (
            <Link
              key={item.key}
              href={dashboardHref(tenantSlug, 'payments', { status: item.key })}
              className="hover:bg-muted focus-visible:ring-ring rounded-lg border p-2.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-muted-foreground flex items-center justify-between text-xs">
                {item.label}
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </span>
              <strong className="mt-1 block font-mono text-xs tabular-nums">
                {formatMoney.format(item.valueMinor / 100)}
              </strong>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
