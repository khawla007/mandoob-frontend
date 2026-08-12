import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Clock3,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import type { ApplicationScope } from '@/lib/signal-studio-filters';
import { cn } from '@/lib/utils';

import {
  paymentSignalHref,
  applicationSignalHref,
  renewalSignalHref,
} from '@/lib/signal-studio-filters';
import { signalLabel } from './widget-format';
import {
  WidgetLoading,
  WidgetMessage,
  type WidgetBaseLabels,
  type WidgetStateProps,
} from './widget-state';

type Kpis = ProDashboardData['kpis'];
export type SignalKpiKey = 'activeClients' | 'openCases' | 'renewals' | 'finance';
type SignalKpiState = { kind: 'error'; message: string; retryHref?: string };

type SignalKpisDataProps = {
  kpis: Kpis;
  tenantSlug: string;
  states?: Partial<Record<SignalKpiKey, SignalKpiState>>;
  filters: ApplicationScope;
};

export type SignalKpisLabels = WidgetBaseLabels & {
  activeClients: string;
  activeClientsHelper: string;
  openCases: string;
  openCasesHelper: string;
  renewalsDue: string;
  renewalsHelper: string;
  collections: string;
  collectionsHelper: string;
};
export type SignalKpisProps = WidgetStateProps<SignalKpisDataProps, SignalKpisLabels>;

type KpiDefinition = {
  key: SignalKpiKey;
  label: string;
  value: string;
  helper: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

export function SignalKpis(props: SignalKpisProps) {
  const { labels } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-kpis-skeleton"
        label={labels.loading}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-7 rounded-2xl border p-5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-9 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} />;

  const { kpis, tenantSlug, locale, filters } = props;

  const integer = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: kpis.currency,
    maximumFractionDigits: 0,
  });
  const definitions: KpiDefinition[] = [
    {
      key: 'activeClients',
      label: labels.activeClients,
      value: integer.format(kpis.activeClients),
      helper: signalLabel(labels.activeClientsHelper, {
        change: `${kpis.activeClientsChange >= 0 ? '+' : ''}${integer.format(kpis.activeClientsChange)}`,
      }),
      href: `/t/${encodeURIComponent(tenantSlug)}/clients?status=active`,
      icon: UsersRound,
      tone: 'signal-kpi--info',
    },
    {
      key: 'openCases',
      label: labels.openCases,
      value: integer.format(kpis.openCases),
      helper: signalLabel(labels.openCasesHelper, {
        moving: integer.format(kpis.movingCases),
        blocked: integer.format(kpis.blockedCases),
      }),
      href: applicationSignalHref(tenantSlug, { view: 'open' }, filters),
      icon: BriefcaseBusiness,
      tone: 'signal-kpi--orange',
    },
    {
      key: 'renewals',
      label: labels.renewalsDue,
      value: integer.format(kpis.renewalsDue30d),
      helper: signalLabel(labels.renewalsHelper, { count: integer.format(kpis.renewalsDue7d) }),
      href: renewalSignalHref(tenantSlug, { tab: 'active', days: 30 }),
      icon: Clock3,
      tone: 'signal-kpi--warning',
    },
    {
      key: 'finance',
      label: labels.collections,
      value: money.format(kpis.collectedMinor / 100),
      helper: signalLabel(labels.collectionsHelper, {
        rate: kpis.collectionRate.toLocaleString(locale, { maximumFractionDigits: 1 }),
      }),
      href: paymentSignalHref(tenantSlug, { view: 'paid' }),
      icon: CircleDollarSign,
      tone: 'signal-kpi--success',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {definitions.map((item) => {
        const state = props.states?.[item.key];
        if (state) {
          return (
            <WidgetMessage
              key={item.key}
              status={state}
              retryLabel={labels.retry}
              className="min-h-40"
            />
          );
        }
        const Icon = item.icon;
        const ChangeIcon = item.helper.startsWith('-') ? ArrowDownRight : ArrowUpRight;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'signal-kpi group relative min-h-40 overflow-hidden rounded-2xl border p-5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transform-none motion-reduce:transition-none',
              item.tone,
            )}
          >
            <span className="mb-7 flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm font-medium">{item.label}</span>
              <span className="bg-background/65 grid size-9 place-items-center rounded-xl border shadow-sm">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </span>
            <strong className="block font-mono text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {item.value}
            </strong>
            <span className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
              <ChangeIcon aria-hidden="true" className="size-3.5 shrink-0" /> {item.helper}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
