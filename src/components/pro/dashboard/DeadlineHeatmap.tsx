import { CalendarClock } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import {
  applicationSignalHref,
  paymentSignalHref,
  renewalSignalHref,
} from '@/lib/signal-studio-filters';
import { formatSignalDate, signalLabel } from './widget-format';
import {
  WidgetLoading,
  WidgetMessage,
  type WidgetBaseLabels,
  type WidgetStateProps,
} from './widget-state';

type Period = 'morning' | 'afternoon';
type EventType = ProDashboardData['deadlineEvents'][number]['eventType'];
type DeadlineCell = {
  date: string;
  period: Period;
  count: number;
  events: ProDashboardData['deadlineEvents'];
  eventTypes: EventType[];
};

type DeadlineHeatmapDataProps = {
  intensity: ProDashboardData['deadlineIntensity'];
  events: ProDashboardData['deadlineEvents'];
  tenantSlug: string;
};

export type DeadlineHeatmapLabels = WidgetBaseLabels & {
  empty: string;
  openApplications: string;
  title: string;
  description: string;
  gridLabel: string;
  cellLabel: string;
  noEventTypes: string;
  morning: string;
  afternoon: string;
  caseEvent: string;
  renewalEvent: string;
  documentEvent: string;
  invoiceEvent: string;
  eventLink: string;
};
export type DeadlineHeatmapProps = WidgetStateProps<
  DeadlineHeatmapDataProps,
  DeadlineHeatmapLabels
>;

function heatLevel(count: number, maximum: number): string {
  if (count === 0) return 'bg-muted/35';
  const ratio = count / Math.max(1, maximum);
  if (ratio > 0.66) return 'bg-[var(--signal-urgent)] text-white';
  if (ratio > 0.33) return 'bg-[var(--signal-warning)] text-slate-950';
  return 'bg-[color-mix(in_oklch,var(--signal-info)_35%,var(--card))]';
}

export function DeadlineHeatmap(props: DeadlineHeatmapProps) {
  const { labels } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-heatmap-skeleton"
        label={labels.loading}
        className="min-h-80 space-y-5 rounded-2xl border p-5"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: 24 }, (_, index) => (
            <Skeleton key={index} className="aspect-square" />
          ))}
        </div>
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-80" />;

  const { intensity, events, tenantSlug, locale } = props;

  const cells: DeadlineCell[] = intensity.flatMap((day) =>
    (['morning', 'afternoon'] as const).map((period) => ({
      date: day.date,
      period,
      count: events.filter((event) => event.date === day.date && event.period === period).length,
      events: events.filter((event) => event.date === day.date && event.period === period),
      eventTypes: Array.from(
        new Set(
          events
            .filter((event) => event.date === day.date && event.period === period)
            .map((event) => event.eventType),
        ),
      ),
    })),
  );
  const activeCells = cells.filter((cell) => cell.count > 0);
  if (activeCells.length === 0) {
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
        className="min-h-80"
      />
    );
  }
  const maximum = Math.max(...cells.map((cell) => cell.count));
  const shownDates = intensity.slice(0, 14);
  const label = (cell: DeadlineCell) => {
    const date = formatSignalDate(cell.date, locale, {
      dateStyle: 'full',
    });
    const types = cell.eventTypes.length
      ? cell.eventTypes.map((type) => labels[`${type}Event` as const]).join(', ')
      : labels.noEventTypes;
    return signalLabel(labels.cellLabel, {
      date,
      period: labels[cell.period],
      count: cell.count,
      types,
    });
  };
  const number = new Intl.NumberFormat(locale);
  const eventHref = (cell: DeadlineCell, type: EventType) => {
    if (type === 'case')
      return applicationSignalHref(tenantSlug, {
        date: cell.date,
        period: cell.period,
        eventTypes: 'case',
      });
    if (type === 'renewal')
      return renewalSignalHref(tenantSlug, {
        tab: 'active',
        date: cell.date,
        period: cell.period,
      });
    if (type === 'invoice')
      return paymentSignalHref(tenantSlug, {
        view: 'due-date',
        date: cell.date,
        period: cell.period,
      });
    return cell.events.find((event) => event.eventType === 'document')!.href;
  };
  const eventCount = (cell: DeadlineCell, type: EventType) =>
    cell.events.filter((event) => event.eventType === type).length;

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-4 text-[var(--signal-warning)]" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="hidden grid-cols-[auto_repeat(14,minmax(1.75rem,1fr))] gap-1.5 md:grid"
          role="grid"
          aria-label={labels.gridLabel}
        >
          <div role="row" className="col-span-full grid grid-cols-subgrid gap-1.5">
            <span role="columnheader" />
            {shownDates.map((day) => (
              <span
                key={day.date}
                role="columnheader"
                className="text-muted-foreground overflow-hidden text-center text-[10px]"
              >
                {formatSignalDate(day.date, locale, {
                  weekday: 'narrow',
                  day: 'numeric',
                })}
              </span>
            ))}
          </div>
          {(['morning', 'afternoon'] as const).map((period) => (
            <div key={period} role="row" className="col-span-full grid grid-cols-subgrid gap-1.5">
              <span
                role="rowheader"
                className="text-muted-foreground self-center pe-2 text-xs capitalize"
              >
                {labels[period]}
              </span>
              {shownDates.map((day) => {
                const cell = cells.find(
                  (item) => item.date === day.date && item.period === period,
                )!;
                return (
                  <span
                    key={`${day.date}-${period}`}
                    role="gridcell"
                    aria-label={label(cell)}
                    className={cn(
                      'grid min-h-12 rounded-md border p-1 text-[11px] font-semibold',
                      heatLevel(cell.count, maximum),
                    )}
                  >
                    <span aria-hidden="true" className="text-center font-mono tabular-nums">
                      {number.format(cell.count)}
                    </span>
                    <span className="flex flex-wrap justify-center gap-1">
                      {cell.eventTypes.map((type) => (
                        <Link
                          key={type}
                          href={eventHref(cell, type)}
                          aria-label={signalLabel(labels.eventLink, {
                            type: labels[`${type}Event` as const],
                            count: number.format(eventCount(cell, type)),
                            date: formatSignalDate(cell.date, locale, { dateStyle: 'full' }),
                            period: labels[cell.period],
                          })}
                          className="focus-visible:ring-ring bg-background/75 rounded px-1 font-mono tabular-nums focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {number.format(eventCount(cell, type))}
                        </Link>
                      ))}
                    </span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <ol className="divide-border divide-y md:hidden">
          {activeCells.map((cell) => (
            <li key={`${cell.date}-${cell.period}`}>
              <div
                aria-label={label(cell)}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {formatSignalDate(cell.date, locale, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs capitalize">
                    {labels[cell.period]}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {cell.eventTypes.map((type) => (
                    <Link
                      key={type}
                      href={eventHref(cell, type)}
                      className="focus-visible:ring-ring rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {labels[`${type}Event` as const]} · {number.format(eventCount(cell, type))}
                    </Link>
                  ))}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
