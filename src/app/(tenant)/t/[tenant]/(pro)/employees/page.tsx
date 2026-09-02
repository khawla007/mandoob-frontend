import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  EmployeeRegistryFilters,
  EmployeeRegistryHeader,
  EmployeeRegistryPagination,
  EmployeeRegistrySignals,
  EmployeeRegistryTable,
} from '@/components/pro/EmployeeRegistryWorkspace';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  listProEmployeeRegistry,
  parseEmployeeRegistrySearch,
} from '@/lib/data/pro-employee-registry';

export const dynamic = 'force-dynamic';

export default async function ProEmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenant: slug }, rawSearch] = await Promise.all([params, searchParams]);
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const search = parseEmployeeRegistrySearch(rawSearch);
  const [result, t, locale] = await Promise.all([
    listProEmployeeRegistry(tenant.id, company.id, search),
    getTranslations('pro.employeeRegistry'),
    getLocale(),
  ]);
  const labels = {
    eyebrow: t('eyebrow'),
    title: t('title'),
    description: t('description'),
    import: t('import'),
    search: t('filters.search'),
    searchPlaceholder: t('filters.searchPlaceholder'),
    status: t('filters.status'),
    identity: t('filters.identity'),
    risk: t('filters.risk'),
    apply: t('filters.apply'),
    reset: t('filters.reset'),
    all: t('filters.all'),
    active: t('status.active'),
    inactive: t('status.inactive'),
    terminated: t('status.terminated'),
    visa: t('filters.visa'),
    eid: t('filters.eid'),
    attention: t('risk.attention'),
    total: t('signals.total'),
    visible: t('signals.visible'),
    page: t('signals.page'),
    unavailableValue: t('signals.unavailableValue'),
    table: t('table.label'),
    employee: t('table.employee'),
    notRecorded: t('notRecorded'),
    tableRisk: t('table.risk'),
    provenance: t('table.provenance'),
    provenanceUnavailable: t('table.provenanceUnavailable'),
    maskedIdentifier: t('table.maskedIdentifier'),
    missing: t('identity.missing'),
    expired: t('identity.expired'),
    current: t('identity.current'),
    clear: t('risk.clear'),
    unknown: t('risk.unknown'),
    empty: t('states.empty'),
    emptyGuidance: t('states.emptyGuidance'),
    emptyFiltered: t('states.emptyFiltered'),
    emptyFilteredGuidance: t('states.emptyFilteredGuidance'),
    unavailable: t('states.unavailable'),
    partial: t('states.partial'),
    sanitizedError: t('states.sanitizedError'),
    pagination: t('pagination.label'),
    previous: t('pagination.previous'),
    next: t('pagination.next'),
    pageCount: t('pagination.pageCount'),
  };

  return (
    <div className="space-y-6">
      <EmployeeRegistryHeader slug={slug} labels={labels} />
      <EmployeeRegistrySignals result={result} labels={labels} />
      <EmployeeRegistryFilters slug={slug} search={search} labels={labels} />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t('table.title')}</h2>
          <p className="text-muted-foreground text-sm">
            {result.state === 'data'
              ? t('table.description', { count: result.total })
              : t('states.partial')}
          </p>
        </div>
        <EmployeeRegistryTable result={result} labels={labels} locale={locale} />
        <EmployeeRegistryPagination slug={slug} search={search} result={result} labels={labels} />
      </section>
    </div>
  );
}
