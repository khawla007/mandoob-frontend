'use client';

import { Activity, ArrowUpRight, ClipboardList, Gauge, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
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
        className="signal-hero grid min-h-72 gap-8 rounded-3xl p-6 sm:p-8 lg:grid-cols-2"
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
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-72" />;
  }

  const { health, actionCount, caseVelocity, tenantSlug, filters } = props;

  const opened = caseVelocity.reduce((sum, point) => sum + point.opened, 0);
  const completed = caseVelocity.reduce((sum, point) => sum + point.completed, 0);
  const maxVelocity = Math.max(
    1,
    ...caseVelocity.flatMap((point) => [point.opened, point.completed]),
  );
  const applicationsHref = applicationSignalHref(tenantSlug, { view: 'open' }, filters);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  return (
    <section className="signal-hero relative isolate overflow-hidden rounded-3xl p-6 text-white shadow-[0_24px_80px_-36px_oklch(0.35_0.15_30/0.85)] sm:p-8">
      <div aria-hidden="true" className="signal-hero__orb" />
      <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div className="max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-orange-100 uppercase">
            <Activity aria-hidden="true" className="size-4" /> {labels.prioritySignals}
          </p>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <strong className="font-mono text-6xl leading-none font-semibold tracking-[-0.08em] tabular-nums sm:text-7xl">
              {integer.format(actionCount)}
            </strong>
            <p className="max-w-xs pb-1 text-lg leading-snug text-white/78">
              {labels.actionSummary}
            </p>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="bg-white text-slate-950 hover:bg-orange-50">
              <Link href={applicationsHref}>
                <ClipboardList aria-hidden="true" /> {labels.openActionDeck}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:bg-white/12 hover:text-white"
            >
              <Link href={applicationsHref}>
                <UserRoundPlus aria-hidden="true" /> {labels.assignWork}
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[0.72fr_1.28fr] lg:grid-cols-1 xl:grid-cols-[0.72fr_1.28fr]">
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={signalLabel(labels.scoreAria, { score: number.format(health.score) })}
                className="focus-visible:ring-ring/80 rounded-2xl border border-white/16 bg-black/18 p-5 text-start backdrop-blur-sm transition-colors hover:bg-black/25 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70 uppercase">
                  <Gauge aria-hidden="true" className="size-4 text-orange-300" /> {labels.score}
                </span>
                <span className="mt-3 block font-mono text-4xl font-semibold tabular-nums">
                  {number.format(health.score)}
                  <span className="text-base font-normal text-white/55">
                    /{integer.format(100)}
                  </span>
                </span>
                <span className="mt-2 block text-xs text-white/60">{labels.openScoreDetails}</span>
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
            className="rounded-2xl border border-white/16 bg-white/7 p-5 backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-wide text-white/70 uppercase">
                {labels.velocity}
              </span>
              <span className="font-mono text-xs text-white/60 tabular-nums">
                {integer.format(caseVelocity.length)}
                {labels.daySuffix}
              </span>
            </div>
            <div aria-hidden="true" className="flex h-16 items-end gap-1">
              {caseVelocity.slice(-14).map((point) => (
                <span key={point.date} className="flex min-w-0 flex-1 items-end gap-px">
                  <i
                    className="block min-h-1 flex-1 rounded-t-sm bg-orange-400"
                    style={{ height: `${Math.max(6, (point.opened / maxVelocity) * 100)}%` }}
                  />
                  <i
                    className="block min-h-1 flex-1 rounded-t-sm bg-teal-300"
                    style={{ height: `${Math.max(6, (point.completed / maxVelocity) * 100)}%` }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-white/72">
              <span className="before:me-1.5 before:inline-block before:size-2 before:rounded-full before:bg-orange-400">
                {integer.format(opened)} {labels.opened}
              </span>
              <span className="before:me-1.5 before:inline-block before:size-2 before:rounded-full before:bg-teal-300">
                {integer.format(completed)} {labels.completed}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
