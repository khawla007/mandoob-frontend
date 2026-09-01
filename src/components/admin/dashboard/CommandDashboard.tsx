import Link from 'next/link';
import {
  Activity,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  Link2,
  RefreshCw,
  UserMinus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KPI_DEFINITIONS, type KpiId } from '@/lib/admin-dashboard/contracts';
import { ADMIN_DASHBOARD_LINKS } from '@/lib/admin-dashboard/links';
import type { AdminCommandDashboard } from '@/lib/data/admin-command-dashboard';
import { DashboardKpiCard } from './DashboardKpiCard';
import { DashboardPanel, ErrorPanel, UnavailablePanel } from './DashboardPanel';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

const KPI_ICONS: Record<KpiId, LucideIcon> = {
  totalLeads: UsersRound,
  totalPros: UsersRound,
  totalCompanies: Building2,
  activeAssignments: Link2,
  unassignedPros: UserMinus,
  unassignedCompanies: Building2,
  activeRegistrations: ClipboardList,
  pendingRenewals: RefreshCw,
  pendingPayments: CircleDollarSign,
  documentsAwaitingReview: FileCheck2,
};

function formatRange(locale: string, start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${formatter.format(new Date(`${start}T00:00:00+04:00`))} – ${formatter.format(new Date(`${end}T00:00:00+04:00`))}`;
}

function formatTimestamp(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function PanelAction({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

export function CommandDashboard({
  dashboard,
  locale,
  t,
}: {
  dashboard: AdminCommandDashboard;
  locale: string;
  t: Translate;
}) {
  const { period } = dashboard;
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <p className="text-primary font-mono text-[0.68rem] font-semibold tracking-[0.14em] uppercase">
            {t('dashboard.command.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight">
            {t('dashboard.command.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard.command.description')}</p>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.68rem]">
            <span>
              {t('dashboard.command.period.range', {
                range: formatRange(locale, period.current.startDate, period.current.endDate),
              })}
            </span>
            <span>
              {t('dashboard.command.period.generatedAt', {
                timestamp: formatTimestamp(locale, period.generatedAt),
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <nav
            aria-label={t('dashboard.command.period.label')}
            className="bg-muted flex rounded-lg p-1"
          >
            {[7, 30, 90].map((days) => (
              <Link
                key={days}
                href={`/admin?period=${days}`}
                aria-current={period.days === days ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  period.days === days
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                {t('dashboard.command.period.days', { days })}
              </Link>
            ))}
          </nav>
          <Button asChild variant="outline" size="sm">
            <Link href={ADMIN_DASHBOARD_LINKS.companies}>
              {t('dashboard.command.actions.companies')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={ADMIN_DASHBOARD_LINKS.leads}>{t('dashboard.command.actions.leads')}</Link>
          </Button>
        </div>
      </header>

      <section
        aria-label={t('dashboard.command.kpis.label')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {KPI_DEFINITIONS.map((definition) => (
          <DashboardKpiCard
            key={definition.id}
            definition={definition}
            state={dashboard.kpis[definition.id]}
            icon={KPI_ICONS[definition.id]}
            locale={locale}
            t={t}
          />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-12">
        <DashboardPanel
          className="xl:col-span-5"
          title={t('dashboard.command.panels.registrationOverview.title')}
          description={t('dashboard.command.panels.registrationOverview.description')}
        >
          <UnavailablePanel t={t} />
        </DashboardPanel>

        <DashboardPanel
          className="xl:col-span-4"
          title={t('dashboard.command.panels.leadFunnel.title')}
          description={t('dashboard.command.panels.leadFunnel.description')}
          action={
            <PanelAction
              href={ADMIN_DASHBOARD_LINKS.leads}
              label={t('dashboard.command.actions.openLeads')}
            />
          }
        >
          {dashboard.leadFunnel.state === 'error' ? (
            <ErrorPanel t={t} />
          ) : dashboard.leadFunnel.state === 'unavailable' ? (
            <UnavailablePanel t={t} />
          ) : (
            <div>
              <p className="text-muted-foreground mb-3 text-[0.68rem] leading-4">
                {t('dashboard.command.panels.leadFunnel.denominator')}
              </p>
              <table className="w-full table-fixed text-xs">
                <thead className="sr-only">
                  <tr>
                    <th>{t('dashboard.command.table.stage')}</th>
                    <th>{t('dashboard.command.table.count')}</th>
                    <th>{t('dashboard.command.table.percentage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.leadFunnel.data.map((row) => (
                    <tr key={row.stage} className="border-b last:border-0">
                      <th scope="row" className="w-3/5 py-2 pe-3 text-start font-medium">
                        <span>{t(`dashboard.command.leadStages.${row.stage}`)}</span>
                        <span className="bg-muted mt-1 block h-1.5 overflow-hidden rounded-full">
                          <span
                            className="bg-primary block h-full rounded-full motion-reduce:transition-none"
                            style={{ width: `${row.percentage}%` }}
                          />
                        </span>
                      </th>
                      <td className="py-2 text-end font-mono tabular-nums">
                        {new Intl.NumberFormat(locale).format(row.count)}
                      </td>
                      <td className="text-muted-foreground py-2 text-end font-mono tabular-nums">
                        {new Intl.NumberFormat(locale, {
                          style: 'percent',
                          maximumFractionDigits: 1,
                        }).format(row.percentage / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel
          className="xl:col-span-3"
          title={t('dashboard.command.panels.activity.title')}
          description={t('dashboard.command.panels.activity.description')}
          action={
            <PanelAction
              href={ADMIN_DASHBOARD_LINKS.audit}
              label={t('dashboard.command.actions.openAudit')}
            />
          }
        >
          {dashboard.activity.state === 'error' ? (
            <ErrorPanel t={t} />
          ) : dashboard.activity.state === 'unavailable' ? (
            <UnavailablePanel t={t} />
          ) : dashboard.activity.data.length === 0 ? (
            <div className="text-muted-foreground flex min-h-44 flex-col items-center justify-center text-center text-xs">
              <Activity aria-hidden className="mb-3 size-5" />
              {t('dashboard.command.panels.activity.empty')}
            </div>
          ) : (
            <ol className="divide-y">
              {dashboard.activity.data.map((item) => (
                <li key={item.id} className="py-2.5 first:pt-0">
                  <p className="text-xs font-medium">
                    {t(`dashboard.command.activities.${item.action}`)}
                  </p>
                  <p className="text-muted-foreground mt-1 truncate text-[0.68rem]">
                    {item.companyName ?? t('dashboard.command.activities.platform')} ·{' '}
                    <time dateTime={item.createdAt}>{formatTimestamp(locale, item.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </DashboardPanel>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-3">
        <DashboardPanel
          title={t('dashboard.command.panels.proHealth.title')}
          description={t('dashboard.command.panels.proHealth.description')}
          action={
            <PanelAction
              href={ADMIN_DASHBOARD_LINKS.proRegistry}
              label={t('dashboard.command.actions.openPros')}
            />
          }
        >
          {dashboard.proHealth.state === 'error' ? (
            <ErrorPanel t={t} />
          ) : dashboard.proHealth.state === 'unavailable' ? (
            <UnavailablePanel t={t} />
          ) : dashboard.proHealth.data.length === 0 ? (
            <p className="text-muted-foreground flex min-h-44 items-center justify-center text-center text-xs">
              {t('dashboard.command.panels.proHealth.empty')}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b text-start">
                  <th className="pb-2 font-medium">{t('dashboard.command.table.pro')}</th>
                  <th className="pb-2 font-medium">{t('dashboard.command.table.company')}</th>
                  <th className="pb-2 text-end font-medium">
                    {t('dashboard.command.table.health')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dashboard.proHealth.data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="max-w-28 truncate py-2.5 font-medium">
                      {row.name ?? t('dashboard.command.panels.proHealth.unnamed')}
                    </td>
                    <td className="text-muted-foreground max-w-32 truncate py-2.5">
                      {row.companyName ?? t('dashboard.command.panels.proHealth.notAssigned')}
                    </td>
                    <td className="py-2.5 text-end">
                      <span className="bg-muted rounded-full px-2 py-1 text-[0.65rem] font-medium">
                        {t(`dashboard.command.proHealth.${row.state}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashboardPanel>

        <DashboardPanel
          title={t('dashboard.command.panels.revenue.title')}
          description={t('dashboard.command.panels.revenue.description')}
          action={
            <PanelAction
              href={ADMIN_DASHBOARD_LINKS.finance}
              label={t('dashboard.command.actions.openFinance')}
            />
          }
        >
          <UnavailablePanel t={t} />
        </DashboardPanel>

        <DashboardPanel
          title={t('dashboard.command.panels.registrationStages.title')}
          description={t('dashboard.command.panels.registrationStages.description')}
        >
          <UnavailablePanel t={t} />
        </DashboardPanel>
      </section>
    </div>
  );
}
