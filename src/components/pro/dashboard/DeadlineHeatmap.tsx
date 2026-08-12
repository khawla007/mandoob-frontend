import { CalendarClock } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import { dashboardHref } from './dashboard-links';
import {
  READY_WIDGET_STATUS,
  WidgetMessage,
  WidgetSkeleton,
  type WidgetStatus,
} from './widget-state';

type Period = 'morning' | 'afternoon';
type EventType = ProDashboardData['deadlineEvents'][number]['eventType'];
type DeadlineCell = { date: string; period: Period; count: number; eventTypes: EventType[] };

export type DeadlineHeatmapProps = {
  intensity: ProDashboardData['deadlineIntensity'];
  events: ProDashboardData['deadlineEvents'];
  tenantSlug: string;
  locale?: string;
  status?: WidgetStatus;
};

function heatLevel(count: number, maximum: number): string {
  if (count === 0) return 'bg-muted/35';
  const ratio = count / Math.max(1, maximum);
  if (ratio > 0.66) return 'bg-[var(--signal-urgent)] text-white';
  if (ratio > 0.33) return 'bg-[var(--signal-warning)] text-slate-950';
  return 'bg-[color-mix(in_oklch,var(--signal-info)_35%,var(--card))]';
}

export function DeadlineHeatmap({
  intensity,
  events,
  tenantSlug,
  locale,
  status = READY_WIDGET_STATUS,
}: DeadlineHeatmapProps) {
  if (status.kind === 'loading')
    return <WidgetSkeleton rows={5} className="min-h-80 rounded-2xl border p-5" />;
  if (status.kind !== 'ready') return <WidgetMessage status={status} className="min-h-80" />;

  const cells: DeadlineCell[] = intensity.flatMap((day) =>
    (['morning', 'afternoon'] as const).map((period) => ({
      date: day.date,
      period,
      count: day[period],
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
        status={{ kind: 'empty', message: 'No deadlines in this range.' }}
        className="min-h-80"
      />
    );
  }
  const maximum = Math.max(...cells.map((cell) => cell.count));
  const shownDates = intensity.slice(0, 14);
  const label = (cell: DeadlineCell) => {
    const date = new Date(`${cell.date}T00:00:00`).toLocaleDateString(locale, {
      dateStyle: 'full',
    });
    const types = cell.eventTypes.length ? cell.eventTypes.join(', ') : 'no event types';
    return `${date}, ${cell.period}, ${cell.count} deadline${cell.count === 1 ? '' : 's'}, ${types}`;
  };

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden="true" className="size-4 text-[var(--signal-warning)]" />
          Deadline intensity
        </CardTitle>
        <CardDescription>
          Submission, appointment, renewal, document, and invoice pressure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="hidden grid-cols-[auto_repeat(14,minmax(1.75rem,1fr))] gap-1.5 md:grid"
          role="grid"
          aria-label="Deadline intensity by date and period"
        >
          <div role="row" className="contents">
            <span role="columnheader" />
            {shownDates.map((day) => (
              <span
                key={day.date}
                role="columnheader"
                className="text-muted-foreground overflow-hidden text-center text-[10px]"
              >
                {new Date(`${day.date}T00:00:00`).toLocaleDateString(locale, {
                  weekday: 'narrow',
                  day: 'numeric',
                })}
              </span>
            ))}
          </div>
          {(['morning', 'afternoon'] as const).map((period) => (
            <div key={period} role="row" className="contents">
              <span
                role="rowheader"
                className="text-muted-foreground self-center pe-2 text-xs capitalize"
              >
                {period}
              </span>
              {shownDates.map((day) => {
                const cell = cells.find(
                  (item) => item.date === day.date && item.period === period,
                )!;
                return (
                  <Link
                    key={`${day.date}-${period}`}
                    href={dashboardHref(tenantSlug, 'applications', {
                      date: day.date,
                      period,
                      eventTypes: cell.eventTypes.join(','),
                    })}
                    aria-label={label(cell)}
                    role="gridcell"
                    className={cn(
                      'focus-visible:ring-ring grid aspect-square min-h-8 place-items-center rounded-md border text-[11px] font-semibold transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transform-none motion-reduce:transition-none',
                      heatLevel(cell.count, maximum),
                    )}
                  >
                    {cell.count}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <ol className="divide-border divide-y md:hidden">
          {activeCells.map((cell) => (
            <li key={`${cell.date}-${cell.period}`}>
              <Link
                href={dashboardHref(tenantSlug, 'applications', {
                  date: cell.date,
                  period: cell.period,
                  eventTypes: cell.eventTypes.join(','),
                })}
                aria-label={label(cell)}
                className="focus-visible:ring-ring flex items-center justify-between gap-3 rounded-md py-3 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {new Date(`${cell.date}T00:00:00`).toLocaleDateString(locale, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs capitalize">
                    {cell.period} · {cell.eventTypes.join(', ')}
                  </span>
                </span>
                <strong className="font-mono text-sm tabular-nums">{cell.count}</strong>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
