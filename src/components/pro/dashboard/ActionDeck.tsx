import { ArrowUpRight, CalendarClock, CircleAlert, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';
import type { WidgetBaseLabels } from './widget-state';
import { formatSignalDeadline, signalLabel } from './widget-format';

type Action = ProDashboardData['actionDeck'][number];

type ActionDeckDataProps = {
  actions: Action[];
  tenantSlug: string;
};

export type ActionDeckLabels = WidgetBaseLabels & {
  empty: string;
  reviewApplications: string;
  title: string;
  description: string;
  actionAria: string;
  unassigned: string;
  noDeadline: string;
  urgency: Record<Action['urgency'], string>;
};
export type ActionDeckProps = WidgetStateProps<ActionDeckDataProps, ActionDeckLabels>;

const urgencyStyles: Record<Action['urgency'], string> = {
  breached:
    'border-[color-mix(in_oklch,var(--signal-urgent)_40%,var(--border))] bg-[color-mix(in_oklch,var(--signal-urgent)_9%,var(--card))]',
  urgent:
    'border-[color-mix(in_oklch,var(--brand-accent)_35%,var(--border))] bg-[var(--signal-orange-soft)]',
  soon: 'border-[color-mix(in_oklch,var(--signal-warning)_35%,var(--border))] bg-[color-mix(in_oklch,var(--signal-warning)_8%,var(--card))]',
  normal: 'border-border bg-card',
};

export function ActionDeck(props: ActionDeckProps) {
  const { labels } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-action-skeleton"
        label={labels.loading}
        className="min-h-96 space-y-3 rounded-2xl border p-5"
      >
        <div className="mb-5 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-96" />;

  const { actions, tenantSlug, locale } = props;
  if (actions.length === 0)
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: labels.empty,
          emptyAction: {
            label: labels.reviewApplications,
            href: `/t/${encodeURIComponent(tenantSlug)}/applications`,
          },
        }}
        retryLabel={labels.retry}
        className="min-h-96"
      />
    );

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleAlert aria-hidden="true" className="size-4 text-[var(--signal-urgent)]" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.slice(0, 5).map((action) => (
          <Link
            key={action.id}
            href={action.href}
            aria-label={signalLabel(labels.actionAria, {
              title: action.title,
              client: action.clientName,
              urgency: labels.urgency[action.urgency],
            })}
            className={cn(
              'group focus-visible:ring-ring block rounded-xl border p-4 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transform-none motion-reduce:transition-none',
              urgencyStyles[action.urgency],
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-foreground truncate font-semibold">{action.title}</span>
                  <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                    {labels.urgency[action.urgency]}
                  </span>
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {action.clientName} · {action.detail}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
              />
            </span>
            <span className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <UserRound aria-hidden="true" className="size-3.5" />
                {action.ownerName ?? labels.unassigned}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                {formatSignalDeadline(action.deadline, locale) ?? labels.noDeadline}
              </span>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
