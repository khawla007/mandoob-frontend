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
  parseDashboardRange,
  type DashboardErrorGroup,
  type DashboardErrorMessages,
} from './page-logic';

export const dynamic = 'force-dynamic';

type DashboardSearchParams = { range?: string | string[] };
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
  if (!context) notFound();
  const { tenant, session } = context;
  const canViewFinance = session.role === 'pro';
  const canViewTeam = session.role === 'pro';

  const range = parseDashboardRange(search.range);
  const [dashboard, t, locale] = await Promise.all([
    getProDashboardData(tenant.id, range),
    getTranslations('pro.dashboard.signalStudio'),
    getLocale(),
  ]);
  const retryHref = `/t/${encodeURIComponent(tenant.slug)}/dashboard?range=${range}`;
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
    scoreAria: t('hero.scoreAria'),
    scoreDetails: t('hero.scoreDetails'),
    openScoreDetails: t('hero.openScoreDetails'),
    dialogTitle: t('hero.dialogTitle'),
    dialogDescription: t('hero.dialogDescription'),
    higherHealthier: t('hero.higherHealthier'),
    lowerHealthier: t('hero.lowerHealthier'),
    velocity: t('hero.velocity'),
    velocityAria: t('hero.velocityAria'),
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
    activeClientsHelper: t('kpis.activeClientsHelper'),
    openCases: t('openCases'),
    openCasesHelper: t('kpis.openCasesHelper'),
    renewalsDue: t('renewalsDue'),
    renewalsHelper: t('kpis.renewalsHelper'),
    collections: t('collections'),
    collectionsHelper: t('kpis.collectionsHelper'),
  } satisfies SignalKpisLabels;
  const velocityLabels = {
    ...baseLabels,
    empty: t('caseVelocityLabels.empty'),
    openApplications: t('caseVelocityLabels.openApplications'),
    summary: t('caseVelocityLabels.summary'),
    title: t('caseVelocity'),
    description: t('caseVelocityLabels.description'),
    rangeLabel: t('rangeLabel'),
    daySuffix: t('daySuffix'),
    opened: t('opened'),
    completed: t('completed'),
    date: t('date'),
    tableCaption: t('caseVelocityLabels.tableCaption'),
  } satisfies CaseVelocityChartLabels;
  const collectionsLabels = {
    ...baseLabels,
    billed: t('collectionsLabels.billed'),
    paid: t('collectionsLabels.paid'),
    dueSoon: t('collectionsLabels.dueSoon'),
    overdue: t('collectionsLabels.overdue'),
    barLabel: t('collectionsLabels.barLabel'),
    empty: t('collectionsLabels.empty'),
    openPayments: t('collectionsLabels.openPayments'),
    amount: t('collectionsLabels.amount'),
    title: t('collectionsWaterfall'),
    description: t('collectionsLabels.description'),
    summary: t('collectionsLabels.summary'),
  } satisfies CollectionsWaterfallLabels;
  const actionLabels = {
    ...baseLabels,
    empty: t('actionLabels.empty'),
    reviewApplications: t('actionLabels.reviewApplications'),
    title: t('actionDeck'),
    description: t('actionLabels.description'),
    actionAria: t('actionLabels.actionAria'),
    unassigned: t('actionLabels.unassigned'),
    noDeadline: t('actionLabels.noDeadline'),
    urgency: {
      breached: t('actionLabels.urgency.breached'),
      urgent: t('actionLabels.urgency.urgent'),
      soon: t('actionLabels.urgency.soon'),
      normal: t('actionLabels.urgency.normal'),
    },
  } satisfies ActionDeckLabels;
  const deadlineLabels = {
    ...baseLabels,
    empty: t('deadlineLabels.empty'),
    openApplications: t('deadlineLabels.openApplications'),
    title: t('deadlineIntensity'),
    description: t('deadlineLabels.description'),
    gridLabel: t('deadlineLabels.gridLabel'),
    cellLabel: t('deadlineLabels.cellLabel'),
    noEventTypes: t('deadlineLabels.noEventTypes'),
    morning: t('deadlineLabels.morning'),
    afternoon: t('deadlineLabels.afternoon'),
    caseEvent: t('deadlineLabels.caseEvent'),
    renewalEvent: t('deadlineLabels.renewalEvent'),
    documentEvent: t('deadlineLabels.documentEvent'),
    invoiceEvent: t('deadlineLabels.invoiceEvent'),
    eventLink: t('deadlineLabels.eventLink'),
    documentLink: t('deadlineLabels.documentLink'),
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
    activeCases: t('teamLabels.activeCases'),
    capacity: t('teamLabels.capacity'),
    capacityValue: t('teamLabels.capacityValue'),
  } satisfies TeamSignalLabels;
  const rangeLabels = { 7: t('range7'), 30: t('range30'), 90: t('range90') } as const;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('subtitle', { tenant: tenant.name })}
          </p>
        </div>
        <nav aria-label={t('rangeLabel')} className="bg-muted flex w-fit rounded-lg p-1">
          {([7, 30, 90] as const).map((days) => (
            <Link
              key={days}
              href={`/t/${encodeURIComponent(tenant.slug)}/dashboard?range=${days}`}
              aria-current={range === days ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring rounded-md px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none',
                range === days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {rangeLabels[days]}
            </Link>
          ))}
        </nav>
      </header>

      <SignalHero
        locale={locale}
        labels={heroLabels}
        {...dataOrError(stateFor(['operations', 'renewals', 'documents', 'finance']), {
          health: dashboard.health,
          actionCount: dashboard.actionDeck.length,
          caseVelocity: dashboard.caseVelocity,
          tenantSlug: tenant.slug,
        })}
      />
      <SignalKpis
        locale={locale}
        labels={kpiLabels}
        {...dataOrError(stateFor(['identity', 'operations', 'renewals', 'finance']), {
          kpis: dashboard.kpis,
          tenantSlug: tenant.slug,
        })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]">
        <div className="order-1 lg:order-2">
          <ActionDeck
            locale={locale}
            labels={actionLabels}
            {...dataOrError(
              stateFor(['identity', 'links', 'operations', 'renewals', 'documents', 'finance']),
              { actions: dashboard.actionDeck, tenantSlug: tenant.slug },
            )}
          />
        </div>
        <div className="order-2 grid gap-6 lg:order-1 xl:grid-cols-2">
          <CaseVelocityChart
            locale={locale}
            labels={velocityLabels}
            {...dataOrError(stateFor(['operations']), {
              data: dashboard.caseVelocity,
              tenantSlug: tenant.slug,
              range,
            })}
          />
          <CollectionsWaterfall
            locale={locale}
            labels={collectionsLabels}
            canViewFinance={canViewFinance}
            {...dataOrError(stateFor(['finance']), {
              finance: dashboard.finance,
              tenantSlug: tenant.slug,
            })}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <DeadlineHeatmap
          locale={locale}
          labels={deadlineLabels}
          {...dataOrError(
            stateFor(['identity', 'links', 'operations', 'renewals', 'documents', 'finance']),
            {
              intensity: dashboard.deadlineIntensity,
              events: dashboard.deadlineEvents,
              tenantSlug: tenant.slug,
            },
          )}
        />
        <RenewalStreams
          locale={locale}
          labels={renewalLabels}
          {...dataOrError(stateFor(['renewals']), {
            streams: dashboard.renewalStreams,
            tenantSlug: tenant.slug,
          })}
        />
      </div>

      {canViewTeam ? (
        <TeamSignal
          locale={locale}
          labels={teamLabels}
          {...dataOrError(stateFor(['operations']), {
            team: dashboard.team,
            unassignedCases: dashboard.kpis.unassignedCases,
            tenantSlug: tenant.slug,
          })}
        />
      ) : null}
    </div>
  );
}
