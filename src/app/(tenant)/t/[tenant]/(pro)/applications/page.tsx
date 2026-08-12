import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireRole } from '@/lib/auth/require-role';
import { ApplicationCreateForm } from '@/components/pro/applications/ApplicationCreateForm';
import { ApplicationsTable } from '@/components/pro/applications/ApplicationsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listServiceCaseWorkspace, type ServiceCaseStatus } from '@/lib/data/service-cases';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { serviceCaseStatuses } from '@/lib/validation/service-case';
import { createApplicationFormAction } from './actions';
import { authorizeApplicationsRead } from './page-authorization';
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
  const tenant = await authorizeApplicationsRead(slug, {
    requirePro: async () => {
      const session = await requireRole('pro');
      return { tenantId: session.tenantId };
    },
    resolveTenant: resolveTenantBySlug,
    requireActive: requireActiveTenant,
  });
  if (!tenant) notFound();

  const filters = parseApplicationFilters(search);
  const requestedPage = filters.id ? 1 : parseApplicationPage(search.page);
  const [workspace, t, locale] = await Promise.all([
    listServiceCaseWorkspace(tenant.id, {
      status: filters.status,
      assignedTo: filters.assigned_to,
      clientId: filters.client_id,
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
  const { cases, clients: clientOptions, owners: ownerOptions } = workspace;
  const create = createApplicationFormAction.bind(null, slug);
  const statusLabels = Object.fromEntries(
    serviceCaseStatuses.map((status) => [status, t(`applicationStatuses.${status}`)]),
  ) as Record<ServiceCaseStatus, string>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('applications')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('applicationsPageSubtitle', { tenant: tenant.name, count: workspace.total })}
        </p>
      </div>

      <details className="group rounded-xl border">
        <summary className="hover:bg-muted/40 focus-visible:ring-ring cursor-pointer list-none rounded-xl px-5 py-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset">
          {t('createApplication')}
        </summary>
        <ApplicationCreateForm
          action={create}
          clients={clientOptions}
          owners={ownerOptions}
          labels={{
            client: t('applicationClient'),
            selectClient: t('selectApplicationClient'),
            title: t('applicationTitle'),
            serviceType: t('applicationServiceType'),
            priority: t('applicationPriority'),
            priorities: {
              low: t('applicationPriorities.low'),
              normal: t('applicationPriorities.normal'),
              high: t('applicationPriorities.high'),
              urgent: t('applicationPriorities.urgent'),
            },
            owner: t('applicationOwner'),
            unassigned: t('applicationUnassigned'),
            dueAt: t('applicationDueAt'),
            slaDueAt: t('applicationSlaDueAt'),
            submit: t('createApplication'),
            pending: t('applicationCreating'),
            success: t('applicationCreated'),
          }}
        />
      </details>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('applicationPipeline')}</CardTitle>
          <CardDescription>{t('applicationFilters')}</CardDescription>
          <form method="get" className="grid gap-3 pt-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
              {t('applicationOwner')}
              <select name="owner" defaultValue={filters.assigned_to ?? ''} className={fieldClass}>
                <option value="">{t('allApplicationOwners')}</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
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
            <div className="flex items-end">
              <button
                type="submit"
                className="border-input bg-background hover:bg-muted focus-visible:ring-ring h-9 rounded-md border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t('filterApplications')}
              </button>
            </div>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApplicationsTable
            rows={cases}
            slug={slug}
            locale={locale}
            labels={{
              client: t('applicationClient'),
              service: t('applicationService'),
              status: t('applicationStatus'),
              owner: t('applicationOwner'),
              slaDue: t('applicationSlaAndDue'),
              action: t('applicationAction'),
              unassigned: t('applicationUnassigned'),
              unknownClient: t('applicationUnknownClient'),
              slaPrefix: t('applicationSla'),
              duePrefix: t('applicationDue'),
              slaBreached: t('applicationSlaBreached'),
              complete: t('completeApplication'),
              cancel: t('cancelApplication'),
              updating: t('applicationUpdating'),
              updated: t('applicationUpdated'),
              noAction: t('noApplicationAction'),
              empty: t('applicationsEmpty'),
              emptyHint: t('applicationsEmptyHint'),
              statuses: statusLabels,
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
