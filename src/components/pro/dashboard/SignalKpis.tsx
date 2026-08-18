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
export type SignalKpiKey = 'activeCompany' | 'openCases' | 'renewals' | 'finance';
type SignalKpiState = { kind: 'error'; message: string; retryHref?: string };

type SignalKpisDataProps = {
  kpis: Kpis;
  tenantSlug: string;
  states?: Partial<Record<SignalKpiKey, SignalKpiState>>;
  filters: ApplicationScope;
};

export type SignalKpisLabels = WidgetBaseLabels & {
  activeCompany: string;
  activeCompanyHelper: string;
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
  tone: string;
  trend: number[];
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
      key: 'activeCompany',
      label: labels.activeCompany,
      value: integer.format(kpis.activeCompany),
      helper: labels.activeCompanyHelper,
      href: `/t/${encodeURIComponent(tenantSlug)}/company`,
      tone: 'signal-kpi--orange',
      trend: [kpis.activeCompany, kpis.activeCompany, kpis.activeCompany],
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
      tone: 'signal-kpi--info',
      trend: [kpis.blockedCases, kpis.movingCases, kpis.openCases],
    },
    {
      key: 'renewals',
      label: labels.renewalsDue,
      value: integer.format(kpis.renewalsDue30d),
      helper: signalLabel(labels.renewalsHelper, { count: integer.format(kpis.renewalsDue7d) }),
      href: renewalSignalHref(tenantSlug, { tab: 'active', days: 30 }),
      tone: 'signal-kpi--warning',
      trend: [kpis.renewalsDue7d, kpis.renewalsDue30d],
    },
    {
      key: 'finance',
      label: labels.collections,
      value: money.format(kpis.collectedMinor / 100),
      helper: signalLabel(labels.collectionsHelper, {
        rate: kpis.collectionRate.toLocaleString(locale, { maximumFractionDigits: 1 }),
      }),
      href: paymentSignalHref(tenantSlug, { view: 'paid' }),
      tone: 'signal-kpi--success',
      trend: [kpis.collectedMinor, kpis.collectionRate],
    },
  ];

  return (
    <div className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
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
        const trendMaximum = Math.max(1, ...item.trend.map((value) => Math.max(0, value)));
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'signal-kpi group relative min-h-[77px] overflow-hidden rounded-[9px] border p-[9px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              item.tone,
            )}
          >
            <span className="signal-kpi__content">
              <span className="block">
                <span className="text-muted-foreground font-semibold tracking-[0.08em] uppercase">
                  {item.label}
                </span>
              </span>
              <strong className="block font-mono leading-none font-semibold tracking-tight tabular-nums">
                {item.value}
              </strong>
              <span className="signal-kpi__helper block max-w-[80%] truncate font-semibold">
                {item.helper}
              </span>
            </span>
            <span aria-hidden="true" className="signal-kpi__bars">
              {item.trend.map((value, index) => (
                <i
                  key={index}
                  style={{ height: `${Math.max(16, (Math.max(0, value) / trendMaximum) * 100)}%` }}
                />
              ))}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
