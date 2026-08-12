'use client';

import Link from 'next/link';
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

const RANGES = [7, 30, 90] as const;

type CaseVelocityChartDataProps = {
  data: ProDashboardData['caseVelocity'];
  tenantSlug: string;
  range?: (typeof RANGES)[number];
  locale?: string;
};

export type CaseVelocityChartProps = WidgetStateProps<CaseVelocityChartDataProps>;

export function CaseVelocityChart(props: CaseVelocityChartProps) {
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-chart-skeleton"
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
    return <WidgetMessage status={props} className="min-h-96" />;

  const { data, tenantSlug, range = 30, locale } = props;
  if (data.length === 0) {
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: 'No cases were opened or completed in this period.',
          emptyAction: {
            label: 'Open applications',
            href: `/t/${encodeURIComponent(tenantSlug)}/applications`,
          },
        }}
        className="min-h-96"
      />
    );
  }

  const opened = data.reduce((sum, point) => sum + point.opened, 0);
  const completed = data.reduce((sum, point) => sum + point.completed, 0);
  const summary = `${opened} cases opened and ${completed} completed during the last ${range} days.`;
  const config = {
    opened: { label: 'Opened', color: 'var(--brand-accent)' },
    completed: { label: 'Completed', color: 'var(--signal-success)' },
  } satisfies ChartConfig;

  return (
    <Card className="signal-panel">
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Case velocity</CardTitle>
          <CardDescription className="mt-1">
            Opened and completed applications over time
          </CardDescription>
        </div>
        <nav aria-label="Case velocity date range" className="bg-muted flex w-fit rounded-lg p-1">
          {RANGES.map((days) => (
            <Link
              key={days}
              href={`/t/${encodeURIComponent(tenantSlug)}/dashboard?range=${days}`}
              aria-current={range === days ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring rounded-md px-3 py-1.5 font-mono text-xs tabular-nums focus-visible:ring-2 focus-visible:outline-none',
                range === days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {days}d
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
          role="img"
          aria-label={summary}
          aria-describedby="case-velocity-summary"
        >
          <AreaChart
            data={data}
            margin={{ left: 0, right: 12, top: 10, bottom: 0 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id="signalOpened" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-opened)" stopOpacity={0.36} />
                <stop offset="100%" stopColor="var(--color-opened)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="signalCompleted" x1="0" y1="0" x2="0" y2="1">
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
                new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
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
                    new Date(`${String(value)}T00:00:00`).toLocaleDateString(locale, {
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
              fill="url(#signalOpened)"
              activeDot={{ r: 5 }}
            />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="var(--color-completed)"
              strokeWidth={2.5}
              fill="url(#signalCompleted)"
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ChartContainer>
        <p className="text-muted-foreground mt-2 text-xs">{summary}</p>
      </CardContent>
    </Card>
  );
}
