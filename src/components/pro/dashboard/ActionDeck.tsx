import { ArrowUpRight, CalendarClock, CircleAlert, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import {
  applicationSignalHref,
  type ApplicationScope,
  withApplicationScope,
} from '@/lib/signal-studio-filters';
import { cn } from '@/lib/utils';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';
import type { WidgetBaseLabels } from './widget-state';
import { formatSignalDeadline, signalLabel } from './widget-format';
import { formatActionCountdown, type ActionCountdownLabels } from './action-deadline';

type Action = ProDashboardData['actionDeck'][number];

type ActionDeckDataProps = {
  actions: Action[];
  tenantSlug: string;
  generatedAt: string;
  filters: ApplicationScope;
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
  countdown: ActionCountdownLabels;
  absoluteDeadline: string;
};
export type ActionDeckProps = WidgetStateProps<ActionDeckDataProps, ActionDeckLabels>;

const ACTION_CARD_TONES = [
  'signal-action-card--coral',
  'signal-action-card--sand',
  'signal-action-card--blue',
] as const;

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

  const { actions, tenantSlug, generatedAt, locale, filters } = props;
  if (actions.length === 0)
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: labels.empty,
          emptyAction: {
            label: labels.reviewApplications,
            href: applicationSignalHref(tenantSlug, { view: 'open' }, filters),
          },
        }}
        retryLabel={labels.retry}
        className="min-h-96"
      />
    );

  return (
    <Card className="signal-panel signal-action-deck">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleAlert aria-hidden="true" className="size-4 text-[var(--signal-urgent)]" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.slice(0, 5).map((action, index) => {
          const countdown = action.deadline
            ? formatActionCountdown(action.deadline, generatedAt, locale, labels.countdown)
            : labels.noDeadline;
          const absoluteDeadline = action.deadline
            ? signalLabel(labels.absoluteDeadline, {
                deadline: formatSignalDeadline(action.deadline, locale) ?? action.deadline,
              })
            : '';
          return (
            <Link
              key={action.id}
              href={
                action.kind === 'case' ? withApplicationScope(action.href, filters) : action.href
              }
              aria-label={signalLabel(labels.actionAria, {
                title: action.title,
                company: action.companyName,
                owner: action.ownerName ?? labels.unassigned,
                countdown,
                absoluteDeadline,
                urgency: labels.urgency[action.urgency],
              })}
              className={cn(
                'group focus-visible:ring-ring signal-action-card border focus-visible:ring-2 focus-visible:outline-none',
                ACTION_CARD_TONES[index % ACTION_CARD_TONES.length],
              )}
            >
              <span className="signal-action-card__top flex items-start justify-between gap-3">
                <span className="signal-action-card__body min-w-0">
                  <span className="signal-action-card__heading flex flex-wrap items-center">
                    <span className="text-foreground truncate font-semibold">{action.title}</span>
                    <span className="signal-action-card__urgency rounded-full border border-current/20 text-[10px] font-bold tracking-wide uppercase">
                      {labels.urgency[action.urgency]}
                    </span>
                  </span>
                  <span className="signal-action-card__detail text-foreground/70 block truncate text-xs">
                    {action.companyName} · {action.detail}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                />
              </span>
              <span className="signal-action-card__meta text-foreground/70 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <UserRound aria-hidden="true" className="size-3.5" />
                  {action.ownerName ?? labels.unassigned}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarClock aria-hidden="true" className="size-3.5" />
                  <span
                    title={
                      action.deadline
                        ? signalLabel(labels.absoluteDeadline, {
                            deadline:
                              formatSignalDeadline(action.deadline, locale) ?? action.deadline,
                          })
                        : undefined
                    }
                  >
                    {countdown}
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
