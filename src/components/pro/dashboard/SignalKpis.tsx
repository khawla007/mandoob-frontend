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

import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

import { dashboardHref } from './dashboard-links';
import {
  READY_WIDGET_STATUS,
  WidgetMessage,
  WidgetSkeleton,
  type WidgetStatus,
} from './widget-state';

type Kpis = ProDashboardData['kpis'];

export type SignalKpisProps = {
  kpis: Kpis;
  tenantSlug: string;
  locale?: string;
  status?: WidgetStatus;
};

type KpiDefinition = {
  label: string;
  value: string;
  helper: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

export function SignalKpis({
  kpis,
  tenantSlug,
  locale,
  status = READY_WIDGET_STATUS,
}: SignalKpisProps) {
  if (status.kind === 'loading') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <WidgetSkeleton key={index} rows={1} className="rounded-2xl border p-5" />
        ))}
      </div>
    );
  }
  if (status.kind !== 'ready') return <WidgetMessage status={status} />;

  const integer = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: kpis.currency,
    maximumFractionDigits: 0,
  });
  const definitions: KpiDefinition[] = [
    {
      label: 'Active clients',
      value: integer.format(kpis.activeClients),
      helper: `${kpis.activeClientsChange >= 0 ? '+' : ''}${integer.format(kpis.activeClientsChange)} this month`,
      href: `/t/${encodeURIComponent(tenantSlug)}/clients?status=active`,
      icon: UsersRound,
      tone: 'signal-kpi--info',
    },
    {
      label: 'Open cases',
      value: integer.format(kpis.openCases),
      helper: `${integer.format(kpis.movingCases)} moving · ${integer.format(kpis.blockedCases)} blocked`,
      href: dashboardHref(tenantSlug, 'applications', { status: 'open' }),
      icon: BriefcaseBusiness,
      tone: 'signal-kpi--orange',
    },
    {
      label: 'Renewals due',
      value: integer.format(kpis.renewalsDue30d),
      helper: `${integer.format(kpis.renewalsDue7d)} due within 7 days`,
      href: dashboardHref(tenantSlug, 'renewals', { days: '30' }),
      icon: Clock3,
      tone: 'signal-kpi--warning',
    },
    {
      label: 'Collections',
      value: money.format(kpis.collectedMinor / 100),
      helper: `${kpis.collectionRate.toLocaleString(locale, { maximumFractionDigits: 1 })}% of billed value`,
      href: dashboardHref(tenantSlug, 'payments', { period: 'month', status: 'collected' }),
      icon: CircleDollarSign,
      tone: 'signal-kpi--success',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {definitions.map((item) => {
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
