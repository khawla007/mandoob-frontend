import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { ApplicationsTable } from '@/components/pro/applications/ApplicationsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listServiceCaseWorkspace, type ServiceCaseStatus } from '@/lib/data/service-cases';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { serviceCaseStatuses } from '@/lib/validation/service-case';
import {
  applicationPageHref,
  parseApplicationFilters,
  parseApplicationPage,
  type ApplicationSearchParams,
} from './page-logic';

export const dynamic = 'force-dynamic';

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2';

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const { tenant: slug } = await params;
  const search = await searchParams;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const filters = parseApplicationFilters(search);
  const requestedPage = filters.id ? 1 : parseApplicationPage(search.page);
  const [workspace, t, locale] = await Promise.all([
    listServiceCaseWorkspace(tenant.id, {
      status: filters.status,
      companyId: company.id,
      serviceType: filters.service_type,
      caseId: filters.id,
      deadlineDate: filters.deadlineDate,
      deadlinePeriod: filters.deadlinePeriod,
      page: requestedPage,
    }),
    getTranslations('pro'),
    getLocale(),
  ]);
  const totalPages = Math.max(1, Math.ceil(workspace.total / workspace.pageSize));
  if (requestedPage > totalPages) {
    redirect(applicationPageHref(slug, filters, totalPages));
  }
  const { cases } = workspace;
  const hasFilters = Boolean(
    filters.id || filters.status?.length || filters.service_type || filters.deadlineDate,
  );
  const summaries = [
    {
      label: t('applicationSummaryFiltered'),
      value: workspace.total,
      hint: t('applicationSummaryExact'),
    },
    {
      label: t('applicationSummaryVisible'),
      value: cases.length,
      hint: t('applicationSummaryCurrentPage'),
    },
    {
      label: t('applicationSummaryOpen'),
      value: cases.filter((row) => row.status !== 'completed' && row.status !== 'cancelled').length,
      hint: t('applicationSummaryCurrentPage'),
    },
    {
      label: t('applicationSummaryBlocked'),
      value: cases.filter((row) => Boolean(row.blockedReason)).length,
      hint: t('applicationSummaryCurrentPage'),
    },
  ];
  const number = new Intl.NumberFormat(locale);
  const statusLabels = Object.fromEntries(
    serviceCaseStatuses.map((status) => [status, t(`applicationStatuses.${status}`)]),
  ) as Record<ServiceCaseStatus, string>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('applications')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('applicationsPageSubtitle', { company: company.companyName, count: workspace.total })}
        </p>
      </div>

      <Card className="signal-panel border-dashed">
        <CardHeader>
          <CardTitle className="text-base">{t('applicationMutationsUnavailable')}</CardTitle>
          <CardDescription>{t('applicationMutationsUnavailableDescription')}</CardDescription>
        </CardHeader>
      </Card>

      <dl className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((summary) => (
          <div key={summary.label} className="signal-kpi signal-kpi--info">
            <dt className="signal-kpi__label">{summary.label}</dt>
            <dd className="signal-kpi__value">{number.format(summary.value)}</dd>
            <p className="signal-kpi__helper">{summary.hint}</p>
          </div>
        ))}
      </dl>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="text-lg">{t('applicationPipeline')}</CardTitle>
          <CardDescription>{t('applicationFilters')}</CardDescription>
          <form
            method="get"
            className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <label className="grid gap-1.5 text-sm font-medium">
              {t('applicationStatus')}
              <select
                name="status"
                defaultValue={filters.status?.join(',') ?? ''}
                className={fieldClass}
              >
                <option value="">{t('allApplicationStatuses')}</option>
                {serviceCaseStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('applicationServiceType')}
              <input
                name="serviceType"
                defaultValue={filters.service_type ?? ''}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('applicationDeadlineDate')}
              <input
                type="date"
                name="date"
                defaultValue={filters.deadlineDate ?? ''}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('applicationDeadlinePeriod')}
              <select
                name="period"
                defaultValue={filters.deadlinePeriod ?? ''}
                className={fieldClass}
              >
                <option value="">{t('allApplicationDeadlinePeriods')}</option>
                <option value="morning">{t('applicationDeadlineMorning')}</option>
                <option value="afternoon">{t('applicationDeadlineAfternoon')}</option>
              </select>
              <input type="hidden" name="eventTypes" value="case" />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="border-input bg-background hover:bg-muted focus-visible:ring-ring h-9 rounded-md border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t('filterApplications')}
              </button>
              {hasFilters ? (
                <Link
                  href={`/t/${encodeURIComponent(slug)}/applications`}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ms-3 inline-flex h-9 items-center text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-2"
                >
                  {t('resetApplicationFilters')}
                </Link>
              ) : null}
            </div>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApplicationsTable
            rows={cases}
            locale={locale}
            labels={{
              title: t('applicationTitle'),
              service: t('applicationService'),
              priority: t('applicationPriority'),
              status: t('applicationStatus'),
              blockers: t('applicationBlockers'),
              slaDue: t('applicationSlaAndDue'),
              updatedAt: t('applicationUpdatedAt'),
              action: t('applicationAction'),
              noBlocker: t('applicationNoBlocker'),
              slaPrefix: t('applicationSla'),
              duePrefix: t('applicationDue'),
              slaBreached: t('applicationSlaBreached'),
              mutationsUnavailable: t('applicationMutationsUnavailable'),
              empty: hasFilters ? t('applicationNoResults') : t('applicationsEmpty'),
              emptyHint: hasFilters ? t('applicationNoResultsHint') : t('applicationsEmptyHint'),
              statuses: statusLabels,
              priorities: {
                low: t('applicationPriorities.low'),
                normal: t('applicationPriorities.normal'),
                high: t('applicationPriorities.high'),
                urgent: t('applicationPriorities.urgent'),
              },
            }}
          />
          {workspace.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                {t('applicationPageSummary', {
                  from: (workspace.page - 1) * workspace.pageSize + 1,
                  to: Math.min(workspace.page * workspace.pageSize, workspace.total),
                  total: workspace.total,
                })}
              </p>
              <nav aria-label={t('applicationPaginationLabel')} className="flex items-center gap-3">
                {workspace.page > 1 ? (
                  <Link
                    href={applicationPageHref(slug, filters, workspace.page - 1)}
                    className="border-input bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {t('applicationPreviousPage')}
                  </Link>
                ) : (
                  <span aria-disabled="true" className="text-muted-foreground px-3 py-1.5 text-sm">
                    {t('applicationPreviousPage')}
                  </span>
                )}
                <span className="text-sm tabular-nums">
                  {workspace.page} / {totalPages}
                </span>
                {workspace.page < totalPages ? (
                  <Link
                    href={applicationPageHref(slug, filters, workspace.page + 1)}
                    className="border-input bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {t('applicationNextPage')}
                  </Link>
                ) : (
                  <span aria-disabled="true" className="text-muted-foreground px-3 py-1.5 text-sm">
                    {t('applicationNextPage')}
                  </span>
                )}
              </nav>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
