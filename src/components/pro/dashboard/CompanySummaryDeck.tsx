import Link from 'next/link';

import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';

type SummaryState = { kind: 'error'; message: string } | undefined;

export type CompanySummaryDeckLabels = {
  readiness: string;
  ready: string;
  actionRequired: string;
  registration: string;
  unavailable: string;
  documents: string;
  priorityActions: string;
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
  company: AssignedCompanyProfile;
  dashboard: ProDashboardData;
  tenantSlug: string;
  locale: string;
  labels: CompanySummaryDeckLabels;
  states?: Partial<Record<'documents' | 'actions' | 'renewals' | 'finance', SummaryState>>;
}) {
  const number = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: dashboard.finance.currency,
    maximumFractionDigits: 0,
  });
  const base = `/t/${encodeURIComponent(tenantSlug)}`;
  const definitions = [
    {
      key: 'readiness',
      label: labels.readiness,
      value: company.readinessCodes.length === 0 ? labels.ready : labels.actionRequired,
      helper: number.format(company.readinessCodes.length),
      href: `${base}/company`,
      tone: 'signal-kpi--orange',
    },
    {
      key: 'registration',
      label: labels.registration,
      value: labels.unavailable,
      helper: labels.unavailable,
      href: `${base}/applications`,
      tone: 'signal-kpi--info',
    },
    {
      key: 'documents',
      label: labels.documents,
      value: number.format(dashboard.pendingDocuments.length),
      helper: states?.documents?.message ?? labels.documents,
      href: `${base}/documents`,
      tone: 'signal-kpi--urgent',
    },
    {
      key: 'actions',
      label: labels.priorityActions,
      value: number.format(dashboard.totalPrioritySignals),
      helper: states?.actions?.message ?? labels.priorityActions,
      href: `${base}/applications`,
      tone: 'signal-kpi--info',
    },
    {
      key: 'renewals',
      label: labels.renewals,
      value: number.format(dashboard.kpis.renewalsDue30d),
      helper: states?.renewals?.message ?? labels.renewalsPeriod,
      href: `${base}/renewals?tab=active&days=30`,
      tone: 'signal-kpi--warning',
    },
    {
      key: 'finance',
      label: labels.invoices,
      value: money.format((dashboard.finance.dueSoonMinor + dashboard.finance.overdueMinor) / 100),
      helper: states?.finance?.message ?? labels.outstanding,
      href: `${base}/payments?view=overdue`,
      tone: 'signal-kpi--success',
    },
  ] as const;

  return (
    <div className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {definitions.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            'signal-kpi group relative min-h-[92px] overflow-hidden rounded-[9px] border p-[10px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
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
            <span className="signal-kpi__helper block truncate font-semibold">{item.helper}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
