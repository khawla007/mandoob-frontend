import { CircleGauge, UserRoundX, UsersRound } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';
import type { WidgetBaseLabels } from './widget-state';
import { signalLabel } from './widget-format';

type TeamSignalDataProps = {
  team: ProDashboardData['team'];
  unassignedCases: number;
  tenantSlug: string;
};

export type TeamSignalLabels = WidgetBaseLabels & {
  empty: string;
  openApplications: string;
  title: string;
  description: string;
  unassignedCases: string;
  activeCases: string;
  capacity: string;
  capacityValue: string;
};
export type TeamSignalProps = WidgetStateProps<TeamSignalDataProps, TeamSignalLabels>;

function capacityTone(capacityPercent: number): string {
  if (capacityPercent > 100) return 'bg-[var(--signal-urgent)]';
  if (capacityPercent > 80) return 'bg-[var(--signal-warning)]';
  return 'bg-[var(--signal-success)]';
}

export function TeamSignal(props: TeamSignalProps) {
  const { labels } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-team-skeleton"
        label={labels.loading}
        className="min-h-80 space-y-5 rounded-2xl border p-5"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-64" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-80" />;

  const { team, unassignedCases, tenantSlug } = props;
  if (team.length === 0 && unassignedCases === 0)
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

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound aria-hidden="true" className="size-4 text-[var(--signal-info)]" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unassignedCases > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_oklch,var(--signal-warning)_35%,var(--border))] bg-[color-mix(in_oklch,var(--signal-warning)_8%,var(--card))] p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <UserRoundX aria-hidden="true" className="size-4" />
              {labels.unassignedCases}
            </span>
            <strong className="font-mono text-sm tabular-nums">{unassignedCases}</strong>
          </div>
        ) : null}
        <ul className="space-y-4">
          {team.map((member) => (
            <li key={member.profileId}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{member.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {signalLabel(labels.activeCases, { count: member.activeCases })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs font-semibold tabular-nums">
                  <CircleGauge aria-hidden="true" className="text-muted-foreground size-3.5" />
                  {member.capacityPercent}%
                </span>
              </div>
              <div
                className="bg-muted h-2 overflow-hidden rounded-full"
                role="meter"
                aria-label={signalLabel(labels.capacity, { name: member.name })}
                aria-valuenow={Math.min(100, member.capacityPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={signalLabel(labels.capacityValue, {
                  percent: member.capacityPercent,
                })}
              >
                <div
                  className={cn('h-full rounded-full', capacityTone(member.capacityPercent))}
                  style={{ width: `${Math.min(100, member.capacityPercent)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
