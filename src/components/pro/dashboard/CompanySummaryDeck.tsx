import Link from 'next/link';

import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

type SummaryState = { kind: 'error'; message: string } | undefined;

export type CompanySummaryDeckLabels = {
  readiness: string;
  ready: string;
  actionRequired: string;
  unavailable: string;
  documents: string;
  renewals: string;
  renewalsPeriod: string;
  invoices: string;
  outstanding: string;
};

export function CompanySummaryDeck({
  company,
  dashboard,
  tenantSlug,
  locale,
  labels,
  states,
}: {
  company: AssignedCompanyProfile | null;
  dashboard: ProDashboardData;
  tenantSlug: string;
  locale: string;
  labels: CompanySummaryDeckLabels;
  states?: Partial<Record<'readiness' | 'documents' | 'renewals' | 'finance', SummaryState>>;
}) {
  const number = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: dashboard.finance.currency,
    maximumFractionDigits: 0,
  });
  const base = `/t/${encodeURIComponent(tenantSlug)}`;
  const readinessUnavailable = company === null || states?.readiness !== undefined;
  const documentsUnavailable = states?.documents !== undefined;
  const renewalsUnavailable = states?.renewals !== undefined;
  const financeUnavailable = states?.finance !== undefined;
  const definitions = [
    {
      key: 'readiness',
      label: labels.readiness,
      value: readinessUnavailable
        ? labels.unavailable
        : company.readinessCodes.length === 0
          ? labels.ready
          : labels.actionRequired,
      helper: readinessUnavailable
        ? (states?.readiness?.message ?? labels.unavailable)
        : number.format(company.readinessCodes.length),
      href: `${base}/company`,
      tone: 'signal-kpi--orange',
      trend: readinessUnavailable
        ? []
        : Object.values(company.sectionProgress).map((status) => (status === 'complete' ? 1 : 0)),
    },
    {
      key: 'documents',
      label: labels.documents,
      value: documentsUnavailable
        ? labels.unavailable
        : number.format(dashboard.pendingDocuments.length),
      helper: documentsUnavailable
        ? (states?.documents?.message ?? labels.unavailable)
        : labels.documents,
      href: `${base}/documents`,
      tone: 'signal-kpi--urgent',
      trend: documentsUnavailable ? [] : dashboard.pendingDocuments.slice(0, 5).map(() => 1),
    },
    {
      key: 'renewals',
      label: labels.renewals,
      value: renewalsUnavailable
        ? labels.unavailable
        : number.format(dashboard.kpis.renewalsDue30d),
      helper: renewalsUnavailable
        ? (states?.renewals?.message ?? labels.unavailable)
        : labels.renewalsPeriod,
      href: `${base}/renewals?tab=active&days=30`,
      tone: 'signal-kpi--warning',
      trend: renewalsUnavailable
        ? []
        : [dashboard.kpis.renewalsDue7d, dashboard.kpis.renewalsDue30d],
    },
    {
      key: 'finance',
      label: labels.invoices,
      value: financeUnavailable
        ? labels.unavailable
        : money.format((dashboard.finance.dueSoonMinor + dashboard.finance.overdueMinor) / 100),
      helper: financeUnavailable
        ? (states?.finance?.message ?? labels.unavailable)
        : labels.outstanding,
      href: `${base}/payments?view=overdue`,
      tone: 'signal-kpi--success',
      trend: financeUnavailable
        ? []
        : [dashboard.finance.dueSoonMinor, dashboard.finance.overdueMinor],
    },
  ] as const;

  return (
    <div className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
      {definitions.map((item) => {
        const trend = item.trend.filter((value) => value > 0);
        const trendMaximum = Math.max(1, ...trend);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'signal-kpi group relative min-h-[77px] overflow-hidden rounded-[9px] border p-[9px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              item.tone,
            )}
          >
            <span className="signal-kpi__content">
              <span className="text-muted-foreground block font-semibold tracking-[0.08em] uppercase">
                {item.label}
              </span>
              <strong className="block font-mono leading-none font-semibold tracking-tight tabular-nums">
                {item.value}
              </strong>
              <span className="signal-kpi__helper block w-full font-semibold break-words whitespace-normal">
                {item.helper}
              </span>
            </span>
            {trend.length > 0 ? (
              <span aria-hidden="true" className="signal-kpi__bars">
                {trend.map((value, index) => (
                  <i
                    key={index}
                    style={{
                      height: `${(value / trendMaximum) * 100}%`,
                      minHeight: 0,
                    }}
                  />
                ))}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
