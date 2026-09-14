import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { RenewalsTable } from '@/components/pro/RenewalsTable';
import { RenewalsTimeline } from '@/components/pro/RenewalsTimeline';
import { NewRenewalDialog } from '@/components/pro/NewRenewalDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  listProRenewalWorkspace,
  parseRenewalWorkspaceSearch,
  renewalWorkspaceCanonicalRedirect,
  renewalWorkspaceHref,
  type RenewalWorkspaceSearch,
} from '@/lib/data/pro-renewal-workspace';

export const dynamic = 'force-dynamic';

type RenewalSearchParams = Record<string, string | string[] | undefined>;
const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2';

export default async function RenewalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<RenewalSearchParams>;
}) {
  const { tenant: slug } = await params;
  const rawSearchParams = await searchParams;
  const search = parseRenewalWorkspaceSearch(rawSearchParams);
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();
  const canonicalHref = renewalWorkspaceCanonicalRedirect(slug, rawSearchParams, search);
  if (canonicalHref) redirect(canonicalHref);

  const [workspace, t, locale] = await Promise.all([
    listProRenewalWorkspace({
      actorProfileId: session.id,
      tenantSlug: slug,
      companyId: company.id,
      search,
    }),
    getTranslations('pro'),
    getLocale(),
  ]);
  if (workspace.canonicalPage !== workspace.page) {
    redirect(renewalWorkspaceHref(slug, search, workspace.canonicalPage));
  }

  const totalPages = Math.max(
    1,
    Math.ceil((workspace.total === null ? 0 : workspace.total) / workspace.pageSize),
  );
  const hasFilters = Boolean(
    search.type !== 'all' ||
    search.status !== 'all' ||
    search.urgency !== 'all' ||
    search.q ||
    search.focus ||
    search.dateState !== 'all' ||
    search.deadlineDate,
  );
  const number = new Intl.NumberFormat(locale);
  const typeLabels = {
    license: t('renewalTypeLicense'),
    visa: t('renewalTypeVisa'),
    eid: t('renewalTypeEid'),
    ejari: t('renewalTypeEjari'),
  };
  const statusLabels = {
    upcoming: t('renewalStatusUpcoming'),
    due_soon: t('renewalStatusDueSoon'),
    overdue: t('renewalStatusOverdue'),
    completed: t('renewalStatusCompleted'),
    cancelled: t('renewalStatusCancelled'),
  };
  const unavailableSummary = workspace.state === 'unavailable';
  const summaries: Array<{ label: string; value: number | null; hint: string }> = [
    {
      label: t('renewalSummaryFiltered'),
      value: unavailableSummary ? null : workspace.total,
      hint: unavailableSummary ? t('renewalSummaryUnavailable') : t('renewalSummaryExact'),
    },
    {
      label: t('renewalSummaryVisible'),
      value: unavailableSummary ? null : workspace.rows.length,
      hint: unavailableSummary ? t('renewalSummaryUnavailable') : t('renewalSummaryCurrentPage'),
    },
    {
      label: t('renewalSummaryOverdue'),
      value: unavailableSummary
        ? null
        : workspace.rows.filter(
            (row) =>
              row.status !== 'completed' &&
              row.status !== 'cancelled' &&
              (row.status === 'overdue' || (row.daysOut !== null && row.daysOut < 0)),
          ).length,
      hint: unavailableSummary ? t('renewalSummaryUnavailable') : t('renewalSummaryCurrentPage'),
    },
    {
      label: t('renewalSummaryMissingDates'),
      value: unavailableSummary
        ? null
        : workspace.rows.filter((row) => row.dueDate === null).length,
      hint: unavailableSummary ? t('renewalSummaryUnavailable') : t('renewalSummaryCurrentPage'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('renewals')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('renewalsPageSubtitle', { tenant: company.companyName })}
          </p>
        </div>
        <NewRenewalDialog slug={slug} />
      </div>

      <dl className="signal-kpis-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((summary) => (
          <div key={summary.label} className="signal-kpi signal-kpi--info min-w-0">
            <dt className="signal-kpi__label">{summary.label}</dt>
            <dd className="signal-kpi__value">
              {summary.value === null ? t('renewalValueUnavailable') : number.format(summary.value)}
            </dd>
            <dd className="signal-kpi__helper">{summary.hint}</dd>
          </div>
        ))}
      </dl>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="text-lg">{t('renewalQueue')}</CardTitle>
          <CardDescription>{t('renewalFilters')}</CardDescription>
          <RenewalTabs
            slug={slug}
            search={search}
            labels={{ active: t('active'), completed: t('completed'), cancelled: t('cancelled') }}
          />
          <form
            method="get"
            className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input type="hidden" name="tab" value={search.tab} />
            {search.focus ? <input type="hidden" name="focus" value={search.focus} /> : null}
            {search.deadlineDate && search.deadlinePeriod ? (
              <>
                <input type="hidden" name="date" value={search.deadlineDate} />
                <input type="hidden" name="period" value={search.deadlinePeriod} />
                <input type="hidden" name="eventTypes" value="renewal" />
              </>
            ) : null}
            <label className="grid gap-1.5 text-sm font-medium">
              {t('renewalType')}
              <select name="type" defaultValue={search.type} className={fieldClass}>
                <option value="all">{t('renewalAllTypes')}</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('renewalStatus')}
              <select
                name="status"
                defaultValue={search.status}
                className={fieldClass}
                disabled={search.tab !== 'active'}
                aria-describedby={
                  search.tab !== 'active' ? 'renewal-status-active-only' : undefined
                }
              >
                <option value="all">{t('renewalAllStatuses')}</option>
                <option value="upcoming">{statusLabels.upcoming}</option>
                <option value="due_soon">{statusLabels.due_soon}</option>
                <option value="overdue">{statusLabels.overdue}</option>
              </select>
              {search.tab !== 'active' ? (
                <span id="renewal-status-active-only" className="text-muted-foreground text-xs">
                  {t('renewalStatusActiveOnly')}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('renewalUrgency')}
              <select
                name="urgency"
                defaultValue={search.urgency}
                className={fieldClass}
                disabled={search.tab !== 'active'}
                aria-describedby={
                  search.tab !== 'active' ? 'renewal-urgency-active-only' : undefined
                }
              >
                <option value="all">{t('renewalUrgencyAll')}</option>
                <option value="overdue">{t('renewalUrgencyOverdue')}</option>
                <option value="today">{t('renewalUrgencyToday')}</option>
                <option value="7">{t('renewalUrgency7')}</option>
                <option value="30">{t('renewalUrgency30')}</option>
                <option value="60">{t('renewalUrgency60')}</option>
                <option value="90">{t('renewalUrgency90')}</option>
                <option value="future">{t('renewalUrgencyFuture')}</option>
              </select>
              {search.tab !== 'active' ? (
                <span id="renewal-urgency-active-only" className="text-muted-foreground text-xs">
                  {t('renewalStatusActiveOnly')}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('renewalDateState')}
              <select name="due" defaultValue={search.dateState} className={fieldClass}>
                <option value="all">{t('renewalAllDateStates')}</option>
                <option value="recorded">{t('renewalRecordedDates')}</option>
                <option value="missing">{t('renewalMissingDates')}</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2 xl:col-span-3">
              {t('renewalSearch')}
              <input name="q" defaultValue={search.q} maxLength={120} className={fieldClass} />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="border-input bg-background hover:bg-muted focus-visible:ring-ring h-9 rounded-md border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t('renewalApplyFilters')}
              </button>
              {hasFilters ? (
                <Link
                  href={renewalWorkspaceHref(slug, {
                    ...search,
                    type: 'all',
                    status: 'all',
                    urgency: 'all',
                    q: '',
                    focus: null,
                    dateState: 'all',
                    deadlineDate: undefined,
                    deadlinePeriod: undefined,
                    page: 1,
                  })}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-2"
                >
                  {t('renewalResetFilters')}
                </Link>
              ) : null}
            </div>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspace.state === 'unavailable' ? (
            <StateMessage
              title={t('renewalUnavailable')}
              description={t('renewalUnavailableDescription')}
            />
          ) : null}
          {workspace.state === 'partial' ? (
            <StateMessage
              title={t('renewalPartial')}
              description={t('renewalPartialDescription')}
            />
          ) : null}
          {workspace.state === 'empty' ? (
            <StateMessage title={t('renewalsEmptyActive')} description={t('renewalEmptyHint')} />
          ) : null}
          {workspace.state === 'no_results' ? (
            <StateMessage title={t('renewalNoResults')} description={t('renewalNoResultsHint')} />
          ) : null}
          {workspace.rows.length > 0 ? (
            <RenewalsTable
              rows={workspace.rows}
              slug={slug}
              locale={locale}
              labels={{
                queue: t('renewalQueue'),
                type: t('renewalType'),
                label: t('renewalLabel'),
                due: t('renewalDue'),
                status: t('renewalStatus'),
                source: t('renewalSource'),
                actionsUnavailable: t('renewalActionsUnavailable'),
                today: t('renewalUrgencyToday'),
                overdue: t('renewalUrgencyOverdue'),
                days: t('renewalDays'),
                missingDate: t('renewalMissingDate'),
                typeValues: typeLabels,
                statusValues: statusLabels,
                sourceValues: {
                  manual: t('renewalSourceManual'),
                  license_backfill: t('renewalSourceAuto'),
                },
              }}
            />
          ) : null}
          {workspace.total !== null && workspace.total > 0 ? (
            <Pagination
              slug={slug}
              search={search}
              page={workspace.page}
              totalPages={totalPages}
              labels={{
                summary: t('renewalPageSummary', {
                  from: (workspace.page - 1) * workspace.pageSize + 1,
                  to: Math.min(workspace.page * workspace.pageSize, workspace.total),
                  total: workspace.total,
                }),
                aria: t('renewalPaginationLabel'),
                previous: t('renewalPreviousPage'),
                next: t('renewalNextPage'),
              }}
            />
          ) : null}
        </CardContent>
      </Card>
      {workspace.rows.length > 0 ? (
        <RenewalsTimeline
          rows={workspace.rows}
          locale={locale}
          labels={{
            title: t('renewalTimeline'),
            due: t('renewalDue'),
            missingDate: t('renewalMissingDate'),
            types: typeLabels,
            statuses: statusLabels,
          }}
        />
      ) : null}
    </div>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}

function RenewalTabs({
  slug,
  search,
  labels,
}: {
  slug: string;
  search: RenewalWorkspaceSearch;
  labels: Record<RenewalWorkspaceSearch['tab'], string>;
}) {
  return (
    <nav aria-label={labels.active} className="flex flex-wrap gap-3 pt-2">
      {(Object.keys(labels) as RenewalWorkspaceSearch['tab'][]).map((tab) => (
        <Link
          key={tab}
          href={renewalWorkspaceHref(slug, {
            ...search,
            tab,
            status: 'all',
            urgency: tab === 'active' ? search.urgency : 'all',
            page: 1,
            focus: null,
          })}
          className={
            tab === search.tab
              ? 'text-foreground font-medium underline underline-offset-4'
              : 'text-muted-foreground hover:text-foreground underline-offset-4 hover:underline'
          }
        >
          {labels[tab]}
        </Link>
      ))}
    </nav>
  );
}

function Pagination({
  slug,
  search,
  page,
  totalPages,
  labels,
}: {
  slug: string;
  search: RenewalWorkspaceSearch;
  page: number;
  totalPages: number;
  labels: { summary: string; aria: string; previous: string; next: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">{labels.summary}</p>
      <nav aria-label={labels.aria} className="flex items-center gap-3">
        {page > 1 ? (
          <Link
            href={renewalWorkspaceHref(slug, search, page - 1)}
            className="border-input bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {labels.previous}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 py-1.5 text-sm">
            {labels.previous}
          </span>
        )}
        <span className="text-sm tabular-nums">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={renewalWorkspaceHref(slug, search, page + 1)}
            className="border-input bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            {labels.next}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 py-1.5 text-sm">
            {labels.next}
          </span>
        )}
      </nav>
    </div>
  );
}
