'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';
import type { WidgetBaseLabels } from './widget-state';
import { formatSignalDate, signalLabel } from './widget-format';

const RANGES = [7, 30, 90] as const;

type CaseVelocityChartDataProps = {
  data: ProDashboardData['caseVelocity'];
  tenantSlug: string;
  range?: (typeof RANGES)[number];
  filterQuery?: string;
};

export type CaseVelocityChartLabels = WidgetBaseLabels & {
  empty: string;
  openApplications: string;
  summary: string;
  title: string;
  description: string;
  rangeLabel: string;
  daySuffix: string;
  opened: string;
  completed: string;
  date: string;
  tableCaption: string;
  showData: string;
};
export type CaseVelocityChartProps = WidgetStateProps<
  CaseVelocityChartDataProps,
  CaseVelocityChartLabels
>;

export function CaseVelocityChart(props: CaseVelocityChartProps) {
  const { labels } = props;
  const gradientId = useId().replaceAll(':', '');
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-chart-skeleton"
        label={labels.loading}
        className="min-h-96 space-y-5 rounded-2xl border p-5"
      >
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-36" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-3 w-64" />
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-96" />;

  const { data, tenantSlug, range = 30, filterQuery, locale } = props;
  if (data.length === 0) {
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: labels.empty,
          emptyAction: {
            label: labels.openApplications,
            href: `/t/${encodeURIComponent(tenantSlug)}/applications`,
          },
        }}
        retryLabel={labels.retry}
        className="min-h-96"
      />
    );
  }

  const opened = data.reduce((sum, point) => sum + point.opened, 0);
  const completed = data.reduce((sum, point) => sum + point.completed, 0);
  const number = new Intl.NumberFormat(locale);
  const summary = signalLabel(labels.summary, {
    opened: number.format(opened),
    completed: number.format(completed),
    range: number.format(range),
  });
  const config = {
    opened: { label: labels.opened, color: 'var(--brand-accent)' },
    completed: { label: labels.completed, color: 'var(--signal-success)' },
  } satisfies ChartConfig;

  return (
    <Card className="signal-panel" role="region" aria-labelledby="case-velocity-title">
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle id="case-velocity-title">{labels.title}</CardTitle>
          <CardDescription className="mt-1">{labels.description}</CardDescription>
        </div>
        <nav aria-label={labels.rangeLabel} className="bg-muted flex w-fit rounded-lg p-1">
          {RANGES.map((days) => (
            <Link
              key={days}
              href={`/t/${encodeURIComponent(tenantSlug)}/dashboard?range=${days}${filterQuery ? `&${filterQuery}` : ''}`}
              aria-current={range === days ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring rounded-md px-3 py-1.5 font-mono text-xs tabular-nums focus-visible:ring-2 focus-visible:outline-none',
                range === days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {number.format(days)}
              {labels.daySuffix}
            </Link>
          ))}
        </nav>
      </CardHeader>
      <CardContent>
        <p className="sr-only" id="case-velocity-summary">
          {summary}
        </p>
        <ChartContainer
          config={config}
          className="aspect-auto h-72 w-full"
          data-testid="case-velocity"
          aria-hidden="true"
        >
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={`${gradientId}-opened`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-opened)" stopOpacity={0.36} />
                <stop offset="100%" stopColor="var(--color-opened)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={`${gradientId}-completed`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-completed)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--color-completed)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 5" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={28}
              tickFormatter={(value: string) =>
                formatSignalDate(value, locale, {
                  month: 'short',
                  day: 'numeric',
                })
              }
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    formatSignalDate(String(value), locale, {
                      dateStyle: 'medium',
                    })
                  }
                />
              }
            />
            <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
            <Area
              type="monotone"
              dataKey="opened"
              stroke="var(--color-opened)"
              strokeWidth={2.5}
              fill={`url(#${gradientId}-opened)`}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="var(--color-completed)"
              strokeWidth={2.5}
              fill={`url(#${gradientId}-completed)`}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        <details className="mt-4">
          <summary className="focus-visible:ring-ring cursor-pointer text-sm font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none">
            {labels.showData}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{labels.tableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{labels.date}</th>
                  <th scope="col">{labels.opened}</th>
                  <th scope="col">{labels.completed}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((point) => (
                  <tr key={point.date}>
                    <th scope="row">
                      {formatSignalDate(point.date, locale, { dateStyle: 'full' })}
                    </th>
                    <td>{number.format(point.opened)}</td>
                    <td>{number.format(point.completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-muted-foreground mt-2 text-xs">{summary}</p>
      </CardContent>
    </Card>
  );
}
