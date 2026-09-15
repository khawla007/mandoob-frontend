import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import {
  ActionDeck,
  CaseVelocityChart,
  CollectionsWaterfall,
  CompanySignalHero,
  CompanySummaryDeck,
  DashboardUnavailablePanel,
  DeadlineHeatmap,
  PendingDocuments,
  RenewalStreams,
  type ActionDeckLabels,
  type CaseVelocityChartLabels,
  type CollectionsWaterfallLabels,
  type CompanySignalHeroLabels,
  type CompanySummaryDeckLabels,
  type DeadlineHeatmapLabels,
  type PendingDocumentsLabels,
  type RenewalStreamsLabels,
} from '@/components/pro/dashboard';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyDashboardForPro } from '@/lib/data/company-profile';
import { getProDashboardData } from '@/lib/data/pro-dashboard';
import { cn } from '@/lib/utils';
import {
  dashboardQuery,
  dashboardWidgetState,
  parseDashboardFilters,
  parseDashboardRange,
  resolveDashboardFilterState,
  type DashboardErrorGroup,
  type DashboardErrorMessages,
} from './page-logic';

export const dynamic = 'force-dynamic';

type DashboardSearchParams = { range?: string | string[]; serviceType?: string | string[] };
type WidgetErrorState = { kind: 'error'; message: string; retryHref: string };

function dataOrError<T extends object>(state: WidgetErrorState | undefined, data: T) {
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
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const companyContext = await readAssignedCompanyDashboardForPro(session.id, slug);
  if (!companyContext || companyContext.tenantId !== tenant.id) notFound();
  const company = companyContext.company;

  const range = parseDashboardRange(search.range);
  const requestedFilters = parseDashboardFilters(search);
  const [t, locale, dashboard] = await Promise.all([
    getTranslations('pro.dashboard.signalStudio'),
    getLocale(),
    getProDashboardData(tenant.id, companyContext.companyId, range, requestedFilters.filters),
  ]);
  const filterState = resolveDashboardFilterState(
    requestedFilters,
    dashboard.appliedFilters,
    dashboard.errors.operations !== undefined,
  );
  const filters = filterState.filters;
  const filterQuery = dashboardQuery(filters);
  const generatedAt = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
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

  const priorityAvailable = (
    ['identity', 'links', 'operations', 'renewals', 'documents', 'finance'] as const
  ).every((group) => dashboard.errors[group] === undefined);
  const velocityAvailable = dashboard.errors.operations === undefined;
  const heroLabels = {
    companyFallback: t('companyFallback'),
    prioritySignals: t('hero.prioritySignals'),
    actionSummary: t('hero.actionSummary'),
    openActionDeck: t('hero.openActionDeck'),
    actionRequired: t('hero.actionRequired'),
    unavailable: t('hero.unavailable'),
    velocityAria: t.raw('hero.velocityAria'),
    velocityUnavailable: t('hero.velocityUnavailable'),
    readinessItems: t.raw('hero.readinessItems'),
    lifecycle: t('companyCommand.lifecycle'),
    jurisdiction: t('companyCommand.jurisdiction'),
    licenceExpiry: t('companyCommand.licenceExpiry'),
    licenceMissing: t('companyCommand.licenceMissing'),
    legalProfile: t('companyCommand.legalProfile'),
    profileSections: t.raw('companyCommand.profileSections'),
    activationReadiness: t('companyCommand.activationReadiness'),
    ready: t('companyCommand.ready'),
    registration: t('companyCommand.registration'),
    registrationUnavailable: t('hero.registrationUnavailable'),
    openCompany: t('companyCommand.openCompany'),
    lifecycleValue: company
      ? t(`companyCommand.lifecycleValues.${company.status}`)
      : t('summary.unavailable'),
    onboardingValue: company
      ? t(`companyCommand.onboardingValues.${company.onboardingStatus}`)
      : t('summary.unavailable'),
  } satisfies CompanySignalHeroLabels;
  const summaryLabels = {
    readiness: t('summary.readiness'),
    ready: t('summary.ready'),
    actionRequired: t('summary.actionRequired'),
    unavailable: t('summary.unavailable'),
    documents: t('summary.documents'),
    renewals: t('summary.renewals'),
    renewalsPeriod: t('summary.renewalsPeriod'),
    invoices: t('summary.invoices'),
    outstanding: t('summary.outstanding'),
  } satisfies CompanySummaryDeckLabels;
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
    title: t('priorityActions'),
    description: t('actionLabels.description'),
    actionAria: t.raw('actionLabels.actionAria'),
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
  const documentLabels = {
    ...baseLabels,
    title: t('pendingDocuments.title'),
    description: t('pendingDocuments.description'),
    empty: t('pendingDocuments.empty'),
    openDocuments: t('pendingDocuments.openDocuments'),
    states: {
      'awaiting-upload': t('pendingDocuments.states.awaitingUpload'),
      'review-pending': t('pendingDocuments.states.reviewPending'),
      'action-required': t('pendingDocuments.states.actionRequired'),
    },
  } satisfies PendingDocumentsLabels;
  const rangeLabels = { 7: t('range7'), 30: t('range30'), 90: t('range90') } as const;

  return (
    <div className="signal-dashboard">
      <div className="signal-dashboard__masthead">
        <strong>{t('masthead')}</strong>
        <time dateTime={dashboard.generatedAt}>{t('generatedAt', { date: generatedAt })}</time>
      </div>
      <header className="signal-dashboard__heading relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
          <h1>{t('headline', { company: company?.companyName ?? t('companyFallback') })}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
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
              className="signal-dashboard__filters grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto]"
            >
              <input type="hidden" name="range" value={range} />
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
              <button
                type="submit"
                className="bg-primary text-primary-foreground min-h-11 self-end rounded-md px-4 text-sm font-semibold"
              >
                {t('filters.apply')}
              </button>
              {filterState.notice ? (
                <p role="status" className="text-muted-foreground text-sm sm:col-span-2">
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

      <div className="signal-dashboard__hero">
        <CompanySignalHero
          company={company}
          dashboard={dashboard}
          tenantSlug={tenant.slug}
          locale={locale}
          filters={filters}
          readinessAvailable={companyContext.readinessState === 'data'}
          priorityAvailable={priorityAvailable}
          velocityAvailable={velocityAvailable}
          labels={heroLabels}
        />
      </div>
      <div className="signal-dashboard__kpis">
        <CompanySummaryDeck
          company={company}
          dashboard={dashboard}
          tenantSlug={tenant.slug}
          locale={locale}
          labels={summaryLabels}
          states={{
            readiness:
              companyContext.profileState === 'data' && companyContext.readinessState === 'data'
                ? undefined
                : { kind: 'error', message: t('companyUnavailable') },
            documents: stateFor(['documents']),
            renewals: stateFor(['renewals']),
            finance: stateFor(['finance']),
          }}
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
          <PendingDocuments
            locale={locale}
            labels={documentLabels}
            {...dataOrError(stateFor(['documents']), {
              documents: dashboard.pendingDocuments,
              tenantSlug: tenant.slug,
            })}
          />
          <CollectionsWaterfall
            locale={locale}
            labels={collectionsLabels}
            canViewFinance
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
          <DashboardUnavailablePanel
            title={t('registration.title')}
            description={t('registration.description')}
            unavailable={t('registrationUnavailable')}
            stages={t.raw('registration.stages') as string[]}
          />
          <DashboardUnavailablePanel
            title={t('activity.title')}
            description={t('activity.description')}
            unavailable={t('activityUnavailable')}
          />
          <DashboardUnavailablePanel
            title={t('notifications.title')}
            description={t('notifications.description')}
            unavailable={t('notificationsUnavailable')}
          />
        </aside>
      </div>
    </div>
  );
}
