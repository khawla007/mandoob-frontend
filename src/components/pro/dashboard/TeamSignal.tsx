import { CircleGauge, UserRoundX, UsersRound } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import {
  READY_WIDGET_STATUS,
  WidgetMessage,
  WidgetSkeleton,
  type WidgetStatus,
} from './widget-state';

export type TeamSignalProps = {
  team: ProDashboardData['team'];
  unassignedCases: number;
  status?: WidgetStatus;
};

function capacityTone(capacityPercent: number): string {
  if (capacityPercent > 100) return 'bg-[var(--signal-urgent)]';
  if (capacityPercent > 80) return 'bg-[var(--signal-warning)]';
  return 'bg-[var(--signal-success)]';
}

export function TeamSignal({
  team,
  unassignedCases,
  status = READY_WIDGET_STATUS,
}: TeamSignalProps) {
  if (status.kind === 'loading')
    return <WidgetSkeleton rows={4} className="min-h-80 rounded-2xl border p-5" />;
  if (status.kind !== 'ready') return <WidgetMessage status={status} className="min-h-80" />;
  if (team.length === 0 && unassignedCases === 0)
    return (
      <WidgetMessage
        status={{ kind: 'empty', message: 'No active workload is assigned.' }}
        className="min-h-80"
      />
    );

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound aria-hidden="true" className="size-4 text-[var(--signal-info)]" />
          Team signal
        </CardTitle>
        <CardDescription>Active case load against the operating capacity target</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unassignedCases > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-[color-mix(in_oklch,var(--signal-warning)_35%,var(--border))] bg-[color-mix(in_oklch,var(--signal-warning)_8%,var(--card))] p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <UserRoundX aria-hidden="true" className="size-4" />
              Unassigned cases
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
                    {member.activeCases} active cases
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
                aria-label={`${member.name} capacity`}
                aria-valuenow={member.capacityPercent}
                aria-valuemin={0}
                aria-valuemax={Math.max(100, member.capacityPercent)}
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
