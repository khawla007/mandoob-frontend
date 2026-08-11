import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApplicationsTable } from '@/components/pro/applications/ApplicationsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listServiceCaseClients,
  listServiceCaseOwners,
  listServiceCases,
  type ServiceCaseStatus,
} from '@/lib/data/service-cases';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { serviceCaseFilterSchema, serviceCaseStatuses } from '@/lib/validation/service-case';
import { createApplicationAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string; owner?: string };

function parseFilters(search: SearchParams) {
  const status = search.status?.split(',').filter(Boolean);
  const parsed = serviceCaseFilterSchema.safeParse({
    status: status?.length ? status : undefined,
    assigned_to: search.owner || undefined,
  });
  return parsed.success ? parsed.data : {};
}

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2';

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tenant: slug } = await params;
  const search = await searchParams;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const filters = parseFilters(search);
  const [cases, clientOptions, ownerOptions, t] = await Promise.all([
    listServiceCases(tenant.id, {
      status: filters.status,
      assignedTo: filters.assigned_to,
      clientId: filters.client_id,
    }),
    listServiceCaseClients(tenant.id),
    listServiceCaseOwners(tenant.id),
    getTranslations('pro'),
  ]);
  const create = createApplicationAction.bind(null, slug);
  const statusLabels = Object.fromEntries(
    serviceCaseStatuses.map((status) => [status, t(`applicationStatuses.${status}`)]),
  ) as Record<ServiceCaseStatus, string>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('applications')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('applicationsPageSubtitle', { tenant: tenant.name, count: cases.length })}
        </p>
      </div>

      <details className="group rounded-xl border">
        <summary className="hover:bg-muted/40 focus-visible:ring-ring cursor-pointer list-none rounded-xl px-5 py-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset">
          {t('createApplication')}
        </summary>
        <form action={create as never} className="grid gap-4 border-t p-5 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationClient')}
            <select name="client_id" required className={fieldClass}>
              <option value="">{t('selectApplicationClient')}</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationTitle')}
            <input name="title" required minLength={2} maxLength={160} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationServiceType')}
            <input
              name="service_type"
              required
              minLength={2}
              maxLength={80}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationPriority')}
            <select name="priority" defaultValue="normal" className={fieldClass}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((priority) => (
                <option key={priority} value={priority}>
                  {t(`applicationPriorities.${priority}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationOwner')}
            <select name="assigned_to" className={fieldClass}>
              <option value="">{t('applicationUnassigned')}</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationDueAt')}
            <input type="datetime-local" name="due_at" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('applicationSlaDueAt')}
            <input type="datetime-local" name="sla_due_at" className={fieldClass} />
          </label>
          <div className="flex items-end md:justify-end">
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring h-9 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {t('createApplication')}
            </button>
          </div>
        </form>
      </details>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('applicationPipeline')}</CardTitle>
          <CardDescription>{t('applicationFilters')}</CardDescription>
          <form method="get" className="grid gap-3 pt-2 sm:grid-cols-[1fr_1fr_auto]">
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
        <CardContent>
          <ApplicationsTable
            rows={cases}
            slug={slug}
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
              noAction: t('noApplicationAction'),
              empty: t('applicationsEmpty'),
              emptyHint: t('applicationsEmptyHint'),
              statuses: statusLabels,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
