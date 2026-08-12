'use client';

import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import type { ApplicationScope } from '@/lib/signal-studio-filters';
import { applicationSignalHref } from '@/lib/signal-studio-filters';
import { cn } from '@/lib/utils';

import { formatSignalDate, signalLabel } from './widget-format';
import { buildDeadlineDrilldowns } from './deadline-heatmap-links';
import { nextDeadlineCellIndex, type DeadlineGridKey } from './deadline-heatmap-navigation';
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
  filters: ApplicationScope;
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
  documentLink: string;
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
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

  const { intensity, events, tenantSlug, locale, filters } = props;

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
            href: applicationSignalHref(tenantSlug, { view: 'open' }, filters),
          },
        }}
        retryLabel={labels.retry}
        className="min-h-80"
      />
    );
  }
  const maximum = Math.max(...cells.map((cell) => cell.count));
  const shownDates = intensity;
  const gridCells = (['morning', 'afternoon'] as const).flatMap((period) =>
    shownDates.map(
      (day) => cells.find((cell) => cell.date === day.date && cell.period === period)!,
    ),
  );
  const rovingIndex = Math.min(activeIndex, gridCells.length - 1);
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
  const drilldowns = (cell: DeadlineCell) =>
    buildDeadlineDrilldowns(cell.events, tenantSlug, cell.date, cell.period, filters);
  const drilldownLabel = (cell: DeadlineCell, drilldown: ReturnType<typeof drilldowns>[number]) =>
    drilldown.event
      ? signalLabel(labels.documentLink, {
          title: drilldown.event.title,
          client: drilldown.event.clientName,
          date: formatSignalDate(cell.date, locale, { dateStyle: 'full' }),
          period: labels[cell.period],
        })
      : signalLabel(labels.eventLink, {
          type: labels[`${drilldown.type}Event` as const],
          count: number.format(drilldown.count),
          date: formatSignalDate(cell.date, locale, { dateStyle: 'full' }),
          period: labels[cell.period],
        });
  const selectedCell = selectedIndex === null ? null : (gridCells[selectedIndex] ?? null);
  const moveFocus = (cellIndex: number, key: string) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const next = nextDeadlineCellIndex(
      cellIndex,
      key as DeadlineGridKey,
      2,
      shownDates.length,
      locale.startsWith('ar') ? 'rtl' : 'ltr',
    );
    setActiveIndex(next);
    cellRefs.current[next]?.focus();
  };

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
        <div className="hidden overflow-x-auto md:block">
          <div
            className="grid min-w-max gap-1.5 pb-2"
            style={{
              gridTemplateColumns: `auto repeat(${shownDates.length}, minmax(2.5rem, 1fr))`,
            }}
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
                  const cellIndex = gridCells.indexOf(cell);
                  return (
                    <div
                      key={`${day.date}-${period}`}
                      role="gridcell"
                      className={cn(
                        'grid min-h-12 rounded-md border p-1 text-[11px] font-semibold',
                        heatLevel(cell.count, maximum),
                      )}
                    >
                      <button
                        type="button"
                        aria-label={label(cell)}
                        tabIndex={rovingIndex === cellIndex ? 0 : -1}
                        ref={(node) => {
                          cellRefs.current[cellIndex] = node;
                        }}
                        onFocus={() => setActiveIndex(cellIndex)}
                        onKeyDown={(event) => {
                          moveFocus(cellIndex, event.key);
                          if (
                            [
                              'ArrowLeft',
                              'ArrowRight',
                              'ArrowUp',
                              'ArrowDown',
                              'Home',
                              'End',
                            ].includes(event.key)
                          ) {
                            event.preventDefault();
                          }
                        }}
                        onClick={() => setSelectedIndex(cellIndex)}
                        className="focus-visible:ring-ring rounded text-center font-mono tabular-nums focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {number.format(cell.count)}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <Dialog
          open={selectedCell !== null}
          onOpenChange={(open) => !open && setSelectedIndex(null)}
        >
          <DialogContent>
            {selectedCell ? (
              <>
                <DialogHeader>
                  <DialogTitle>{label(selectedCell)}</DialogTitle>
                  <DialogDescription>{labels.description}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                  {drilldowns(selectedCell).map((drilldown) => (
                    <Link
                      key={drilldown.key}
                      href={drilldown.href}
                      aria-label={drilldownLabel(selectedCell, drilldown)}
                      className="focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {drilldown.event?.title ?? labels[`${drilldown.type}Event` as const]} ·{' '}
                      {number.format(drilldown.count)}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
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
                <span className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {drilldowns(cell).map((drilldown) => (
                    <Link
                      key={drilldown.key}
                      href={drilldown.href}
                      aria-label={drilldownLabel(cell, drilldown)}
                      className="focus-visible:ring-ring rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {drilldown.event?.title ?? labels[`${drilldown.type}Event` as const]} ·{' '}
                      {number.format(drilldown.count)}
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
