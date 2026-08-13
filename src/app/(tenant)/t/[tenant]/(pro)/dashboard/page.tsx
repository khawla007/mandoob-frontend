import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import {
  ActionDeck,
  CaseVelocityChart,
  CollectionsWaterfall,
  DeadlineHeatmap,
  RenewalStreams,
  SignalHero,
  SignalKpis,
  TeamSignal,
  type ActionDeckLabels,
  type CaseVelocityChartLabels,
  type CollectionsWaterfallLabels,
  type DeadlineHeatmapLabels,
  type RenewalStreamsLabels,
  type SignalHeroLabels,
  type SignalKpisLabels,
  type TeamSignalLabels,
} from '@/components/pro/dashboard';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireRole } from '@/lib/auth/require-role';
import { getProDashboardData } from '@/lib/data/pro-dashboard';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { cn } from '@/lib/utils';

import { authorizeProDashboardRead } from './page-authorization';
import {
  dashboardWidgetState,
  dashboardQuery,
  parseDashboardFilters,
  parseDashboardRange,
  resolveDashboardFilterState,
  type DashboardErrorGroup,
  type DashboardErrorMessages,
} from './page-logic';

export const dynamic = 'force-dynamic';

type DashboardSearchParams = {
  range?: string | string[];
  owner?: string | string[];
  serviceType?: string | string[];
};
type WidgetErrorState = { kind: 'error'; message: string; retryHref: string };

function dataOrError<T extends object>(
  state: WidgetErrorState | undefined,
  data: T,
): T | WidgetErrorState {
  return state ?? data;
}

export default async function ProDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const [{ tenant: slug }, search] = await Promise.all([params, searchParams]);
  const context = await authorizeProDashboardRead(slug, {
    requirePro: async () => {
      const session = await requireRole('pro');
      return { tenantId: session.tenantId, role: 'pro' };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
  });
  if (context.kind === 'not-found') notFound();
  const { tenant, session } = context;
  const [t, locale] = await Promise.all([
    getTranslations('pro.dashboard.signalStudio'),
    getLocale(),
  ]);
  if (context.kind === 'inactive') {
    return (
      <div role="status" className="signal-dashboard__state rounded-2xl border p-8">
        <h1 className="text-xl font-semibold">{t('suspended.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('suspended.description')}</p>
      </div>
    );
  }
  const canViewFinance = session.role === 'pro';
  const canViewTeam = session.role === 'pro';

  const range = parseDashboardRange(search.range);
  const requestedFilters = parseDashboardFilters(search);
  const dashboard = await getProDashboardData(tenant.id, range, requestedFilters.filters);
  const filterState = resolveDashboardFilterState(
    requestedFilters,
    dashboard.appliedFilters,
    dashboard.errors.operations !== undefined,
  );
  const filters = filterState.filters;
  const filterQuery = dashboardQuery(filters);
  const generatedAt = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(dashboard.generatedAt));
  const retryHref = `/t/${encodeURIComponent(tenant.slug)}/dashboard?${dashboardQuery(filters, range)}`;
  const errorMessages = {
    identity: t('errors.identity'),
    links: t('errors.links'),
    operations: t('errors.operations'),
    renewals: t('errors.renewals'),
    documents: t('errors.documents'),
    finance: t('errors.finance'),
  } satisfies DashboardErrorMessages;
  const stateFor = (groups: readonly DashboardErrorGroup[]) =>
    dashboardWidgetState(dashboard.errors, groups, errorMessages, retryHref);
  const baseLabels = { loading: t('loading'), retry: t('retry') };

  const heroLabels = {
    ...baseLabels,
    prioritySignals: t('prioritySignals'),
    actionSummary: t('hero.actionSummary'),
    openActionDeck: t('openActionDeck'),
    assignWork: t('assignWork'),
    score: t('operationsScore'),
    scoreAria: t.raw('hero.scoreAria'),
    scoreDetails: t('hero.scoreDetails'),
    openScoreDetails: t('hero.openScoreDetails'),
    dialogTitle: t.raw('hero.dialogTitle'),
    dialogDescription: t('hero.dialogDescription'),
    higherHealthier: t('hero.higherHealthier'),
    lowerHealthier: t('hero.lowerHealthier'),
    velocity: t('hero.velocity'),
    velocityAria: t.raw('hero.velocityAria'),
    daySuffix: t('daySuffix'),
    opened: t('opened'),
    completed: t('completed'),
    overdueRatio: t('hero.overdueRatio'),
    slaCompletionRate: t('hero.slaCompletionRate'),
    blockedRatio: t('hero.blockedRatio'),
    reminderRate: t('hero.reminderRate'),
    workloadBalance: t('hero.workloadBalance'),
  } satisfies SignalHeroLabels;
  const kpiLabels = {
    ...baseLabels,
    activeClients: t('activeClients'),
    activeClientsHelper: t.raw('kpis.activeClientsHelper'),
    openCases: t('openCases'),
    openCasesHelper: t.raw('kpis.openCasesHelper'),
    renewalsDue: t('renewalsDue'),
    renewalsHelper: t.raw('kpis.renewalsHelper'),
    collections: t('collections'),
    collectionsHelper: t.raw('kpis.collectionsHelper'),
  } satisfies SignalKpisLabels;
  const velocityLabels = {
    ...baseLabels,
    empty: t('caseVelocityLabels.empty'),
    openApplications: t('caseVelocityLabels.openApplications'),
    summary: t.raw('caseVelocityLabels.summary'),
    title: t('caseVelocity'),
    description: t('caseVelocityLabels.description'),
    rangeLabel: t('rangeLabel'),
    daySuffix: t('daySuffix'),
    opened: t('opened'),
    completed: t('completed'),
    date: t('date'),
    tableCaption: t('caseVelocityLabels.tableCaption'),
    showData: t('caseVelocityLabels.showData'),
  } satisfies CaseVelocityChartLabels;
  const collectionsLabels = {
    ...baseLabels,
    billed: t('collectionsLabels.billed'),
    paid: t('collectionsLabels.paid'),
    dueSoon: t('collectionsLabels.dueSoon'),
    overdue: t('collectionsLabels.overdue'),
    barLabel: t.raw('collectionsLabels.barLabel'),
    empty: t('collectionsLabels.empty'),
    openPayments: t('collectionsLabels.openPayments'),
    amount: t('collectionsLabels.amount'),
    title: t('collectionsWaterfall'),
    description: t('collectionsLabels.description'),
    summary: t.raw('collectionsLabels.summary'),
  } satisfies CollectionsWaterfallLabels;
  const actionLabels = {
    ...baseLabels,
    empty: t('actionLabels.empty'),
    reviewApplications: t('actionLabels.reviewApplications'),
    title: t('actionDeck'),
    description: t('actionLabels.description'),
    actionAria: t.raw('actionLabels.actionAria'),
    unassigned: t('actionLabels.unassigned'),
    noDeadline: t('actionLabels.noDeadline'),
    urgency: {
      breached: t('actionLabels.urgency.breached'),
      urgent: t('actionLabels.urgency.urgent'),
      soon: t('actionLabels.urgency.soon'),
      normal: t('actionLabels.urgency.normal'),
    },
    countdown: {
      breached: t('actionLabels.countdown.breached'),
      today: t('actionLabels.countdown.today'),
      hours: t.raw('actionLabels.countdown.hours'),
      minutes: t.raw('actionLabels.countdown.minutes'),
      days: t.raw('actionLabels.countdown.days'),
    },
    absoluteDeadline: t.raw('actionLabels.absoluteDeadline'),
  } satisfies ActionDeckLabels;
  const deadlineLabels = {
    ...baseLabels,
    empty: t('deadlineLabels.empty'),
    openApplications: t('deadlineLabels.openApplications'),
    title: t('deadlineIntensity'),
    description: t('deadlineLabels.description'),
    gridLabel: t('deadlineLabels.gridLabel'),
    cellLabel: t.raw('deadlineLabels.cellLabel'),
    noEventTypes: t('deadlineLabels.noEventTypes'),
    morning: t('deadlineLabels.morning'),
    afternoon: t('deadlineLabels.afternoon'),
    caseEvent: t('deadlineLabels.caseEvent'),
    renewalEvent: t('deadlineLabels.renewalEvent'),
    documentEvent: t('deadlineLabels.documentEvent'),
    invoiceEvent: t('deadlineLabels.invoiceEvent'),
    eventLink: t.raw('deadlineLabels.eventLink'),
    documentLink: t.raw('deadlineLabels.documentLink'),
    close: t('deadlineLabels.close'),
  } satisfies DeadlineHeatmapLabels;
  const renewalLabels = {
    ...baseLabels,
    empty: t('renewalLabels.empty'),
    openRenewals: t('renewalLabels.openRenewals'),
    title: t('renewalStreams'),
    description: t('renewalLabels.description'),
    days: t('renewalLabels.days'),
    types: {
      license: t('renewalLabels.types.license'),
      visa: t('renewalLabels.types.visa'),
      eid: t('renewalLabels.types.eid'),
      ejari: t('renewalLabels.types.ejari'),
    },
  } satisfies RenewalStreamsLabels;
  const teamLabels = {
    ...baseLabels,
    empty: t('teamLabels.empty'),
    openApplications: t('teamLabels.openApplications'),
    title: t('teamSignal'),
    description: t('teamLabels.description'),
    unassignedCases: t('teamLabels.unassignedCases'),
    activeCases: t.raw('teamLabels.activeCases'),
    capacity: t.raw('teamLabels.capacity'),
    capacityValue: t.raw('teamLabels.capacityValue'),
  } satisfies TeamSignalLabels;
  const rangeLabels = { 7: t('range7'), 30: t('range30'), 90: t('range90') } as const;

  return (
    <div className="signal-dashboard">
      <div className="signal-dashboard__masthead">
        <strong>{t('masthead')}</strong>
        <span className="signal-dashboard__live">{t('live')}</span>
        <time dateTime={dashboard.generatedAt}>{generatedAt} GST</time>
      </div>

      <header className="signal-dashboard__heading relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
          <h1>{t('headline')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('subtitle', { tenant: tenant.name })}
          </p>
        </div>
        <div className="signal-dashboard__heading-tools">
          <nav aria-label={t('rangeLabel')} className="bg-muted flex w-fit rounded-lg p-1">
            {([7, 30, 90] as const).map((days) => (
              <Link
                key={days}
                href={`/t/${encodeURIComponent(tenant.slug)}/dashboard?${dashboardQuery(filters, days)}`}
                aria-current={range === days ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring rounded-md px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none',
                  range === days
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground/70 hover:text-foreground',
                )}
              >
                {rangeLabels[days]}
              </Link>
            ))}
          </nav>
          <details className="signal-dashboard__filter-drawer">
            <summary>{t('filters.toggle')}</summary>
            <form
              method="get"
              className="signal-dashboard__filters grid gap-3 rounded-2xl border p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <input type="hidden" name="range" value={range} />
              <label className="text-sm font-medium">
                {t('filters.owner')}
                <select
                  name="owner"
                  defaultValue={filters.ownerId ?? ''}
                  className="border-input bg-background mt-1 block h-9 w-full rounded-md border px-3"
                >
                  <option value="">{t('filters.allOwners')}</option>
                  {dashboard.filterOptions.owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t('filters.serviceType')}
                <select
                  name="serviceType"
                  defaultValue={filters.serviceType ?? ''}
                  className="border-input bg-background mt-1 block h-9 w-full rounded-md border px-3"
                >
                  <option value="">{t('filters.allServices')}</option>
                  {dashboard.filterOptions.serviceTypes.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {serviceType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t('filters.branch')}
                <select
                  disabled
                  aria-describedby="branch-unavailable"
                  className="border-input bg-muted mt-1 block h-9 w-full rounded-md border px-3"
                >
                  <option>{t('filters.allBranches')}</option>
                </select>
                <span id="branch-unavailable" className="text-muted-foreground text-xs">
                  {t('filters.branchUnavailable')}
                </span>
              </label>
              <button className="bg-primary text-primary-foreground h-9 self-end rounded-md px-4 text-sm font-medium">
                {t('filters.apply')}
              </button>
              {filterState.notice ? (
                <p
                  role="status"
                  className="text-muted-foreground text-sm sm:col-span-3 lg:col-span-4"
                >
                  {t(
                    filterState.notice === 'pending'
                      ? 'filters.pendingNotice'
                      : 'filters.invalidNotice',
                  )}
                </p>
              ) : null}
            </form>
          </details>
        </div>
      </header>

      <SignalHero
        locale={locale}
        labels={heroLabels}
        {...dataOrError(stateFor(['operations', 'renewals', 'documents', 'finance']), {
          health: dashboard.health,
          actionCount: dashboard.totalPrioritySignals,
          caseVelocity: dashboard.caseVelocity,
          tenantSlug: tenant.slug,
          filters,
        })}
      />
      <div className="signal-dashboard__kpis">
        <SignalKpis
          locale={locale}
          labels={kpiLabels}
          {...dataOrError(undefined, {
            kpis: dashboard.kpis,
            tenantSlug: tenant.slug,
            filters,
            states: {
              activeClients: stateFor(['identity']),
              openCases: stateFor(['operations']),
              renewals: stateFor(['renewals']),
              finance: stateFor(['finance']),
            },
          })}
        />
      </div>

      <div className="signal-dashboard__layout">
        <div className="signal-dashboard__operations">
          <div className="signal-dashboard__action order-1 lg:order-2">
            <ActionDeck
              locale={locale}
              labels={actionLabels}
              {...dataOrError(
                stateFor(['identity', 'links', 'operations', 'renewals', 'documents', 'finance']),
                {
                  actions: dashboard.actionDeck,
                  tenantSlug: tenant.slug,
                  generatedAt: dashboard.generatedAt,
                  filters,
                },
              )}
            />
          </div>
          <div className="order-2 lg:order-1">
            <CaseVelocityChart
              locale={locale}
              labels={velocityLabels}
              {...dataOrError(stateFor(['operations']), {
                data: dashboard.caseVelocity,
                tenantSlug: tenant.slug,
                filters,
                range,
                filterQuery,
              })}
            />
          </div>
          <div className="order-3">
            <DeadlineHeatmap
              locale={locale}
              labels={deadlineLabels}
              {...dataOrError(
                stateFor(['identity', 'links', 'operations', 'renewals', 'documents', 'finance']),
                {
                  intensity: dashboard.deadlineIntensity,
                  events: dashboard.deadlineEvents,
                  tenantSlug: tenant.slug,
                  filters,
                },
              )}
            />
          </div>
        </div>

        <aside className="signal-dashboard__rail">
          <CollectionsWaterfall
            locale={locale}
            labels={collectionsLabels}
            canViewFinance={canViewFinance}
            {...dataOrError(stateFor(['finance']), {
              finance: dashboard.finance,
              tenantSlug: tenant.slug,
            })}
          />
          <RenewalStreams
            locale={locale}
            labels={renewalLabels}
            {...dataOrError(stateFor(['renewals']), {
              streams: dashboard.renewalStreams,
              tenantSlug: tenant.slug,
            })}
          />
          {canViewTeam ? (
            <TeamSignal
              locale={locale}
              labels={teamLabels}
              {...dataOrError(stateFor(['operations']), {
                team: dashboard.team,
                unassignedCases: dashboard.kpis.unassignedCases,
                tenantSlug: tenant.slug,
                filters,
              })}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
