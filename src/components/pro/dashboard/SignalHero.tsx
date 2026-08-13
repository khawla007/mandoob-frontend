'use client';

import Link from 'next/link';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { applicationSignalHref, type ApplicationScope } from '@/lib/signal-studio-filters';

import { WidgetLoading, WidgetMessage, type WidgetStateProps } from './widget-state';
import type { WidgetBaseLabels } from './widget-state';
import { signalLabel } from './widget-format';

type Health = ProDashboardData['health'];
type Velocity = ProDashboardData['caseVelocity'];

const HEALTH_INPUTS: Array<{
  key: keyof Omit<Health, 'score'>;
  positive: boolean;
}> = [
  { key: 'overdueRatio', positive: false },
  { key: 'slaCompletionRate', positive: true },
  { key: 'blockedRatio', positive: false },
  { key: 'reminderRate', positive: true },
  { key: 'workloadBalance', positive: true },
];

type SignalHeroDataProps = {
  health: Health;
  actionCount: number;
  caseVelocity: Velocity;
  tenantSlug: string;
  filters: ApplicationScope;
};

function velocityPoints(data: Velocity, key: 'opened' | 'completed', maximum: number) {
  const denominator = Math.max(1, data.length - 1);
  return data
    .map((point, index) => `${(index / denominator) * 100},${40 - (point[key] / maximum) * 34}`)
    .join(' ');
}

export type SignalHeroLabels = WidgetBaseLabels & {
  prioritySignals: string;
  actionSummary: string;
  openActionDeck: string;
  assignWork: string;
  score: string;
  scoreAria: string;
  scoreDetails: string;
  openScoreDetails: string;
  dialogTitle: string;
  dialogDescription: string;
  higherHealthier: string;
  lowerHealthier: string;
  velocity: string;
  velocityAria: string;
  daySuffix: string;
  opened: string;
  completed: string;
  overdueRatio: string;
  slaCompletionRate: string;
  blockedRatio: string;
  reminderRate: string;
  workloadBalance: string;
};
export type SignalHeroProps = WidgetStateProps<SignalHeroDataProps, SignalHeroLabels>;

export function SignalHero(props: SignalHeroProps) {
  const { labels, locale } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-hero-skeleton"
        label={labels.loading}
        className="signal-hero rounded-[12px] p-[13px]"
      >
        <div className="space-y-5">
          <Skeleton className="h-4 w-32 bg-white/15" />
          <Skeleton className="h-20 w-4/5 bg-white/15" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-36 bg-white/15" />
            <Skeleton className="h-9 w-28 bg-white/15" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-44 bg-white/15" />
          <Skeleton className="h-44 bg-white/15" />
        </div>
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error') {
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-[126px]" />;
  }

  const { health, actionCount, caseVelocity, tenantSlug, filters } = props;

  const opened = caseVelocity.reduce((sum, point) => sum + point.opened, 0);
  const completed = caseVelocity.reduce((sum, point) => sum + point.completed, 0);
  const maxVelocity = Math.max(
    1,
    ...caseVelocity.flatMap((point) => [point.opened, point.completed]),
  );
  const graphData = caseVelocity.slice(-14);
  const openedPoints = velocityPoints(graphData, 'opened', maxVelocity);
  const completedPoints = velocityPoints(graphData, 'completed', maxVelocity);
  const applicationsHref = applicationSignalHref(tenantSlug, { view: 'open' }, filters);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  return (
    <section className="signal-hero relative isolate overflow-hidden rounded-[12px] p-[13px] text-white">
      <div aria-hidden="true" className="signal-hero__orb" />
      <div className="signal-hero__content">
        <p className="signal-hero__tag">
          <span aria-hidden="true">●</span> {integer.format(actionCount)} {labels.prioritySignals}
        </p>
        <h3>
          {integer.format(actionCount)} {labels.actionSummary}
        </h3>
        <p>
          {integer.format(opened)} {labels.opened} · {integer.format(completed)} {labels.completed}
        </p>
        <div className="signal-hero__actions">
          <Link href={applicationsHref} className="signal-hero__action-hot">
            {labels.openActionDeck}
          </Link>
          <Link href={applicationsHref} className="signal-hero__action-glass">
            {labels.assignWork}
          </Link>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={signalLabel(labels.scoreAria, { score: number.format(health.score) })}
            className="signal-hero__score focus-visible:ring-ring/80 focus-visible:ring-2 focus-visible:outline-none"
          >
            <strong>{number.format(health.score)}</strong>
            <span>{labels.score}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {signalLabel(labels.dialogTitle, { score: number.format(health.score) })}
            </DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>
          <dl className="divide-border divide-y">
            {HEALTH_INPUTS.map(({ key, positive }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground text-sm">{labels[key]}</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">
                  {percent.format(health[key] / 100)}
                  <span className="sr-only">
                    ; {positive ? labels.higherHealthier : labels.lowerHealthier}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <div
        role="img"
        aria-label={signalLabel(labels.velocityAria, {
          opened: integer.format(opened),
          completed: integer.format(completed),
          days: integer.format(caseVelocity.length),
        })}
        className="signal-hero__chart"
      >
        <svg aria-hidden="true" viewBox="0 0 100 44" preserveAspectRatio="none">
          <path
            d="M0 10H100M0 25H100M0 40H100"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="0.4"
          />
          {openedPoints ? (
            <polygon points={`${openedPoints} 100,44 0,44`} fill="white" fillOpacity="0.22" />
          ) : null}
          <polyline
            points={openedPoints}
            fill="none"
            stroke="white"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={completedPoints}
            fill="none"
            stroke="#ffb176"
            strokeWidth="1.2"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}
