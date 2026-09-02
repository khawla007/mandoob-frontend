import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  EmployeeRegistryFilters,
  EmployeeRegistryHeader,
  EmployeeRegistryPagination,
  EmployeeRegistrySignals,
  EmployeeRegistryTable,
} from '@/components/pro/EmployeeRegistryWorkspace';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  employeeRegistryHref,
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
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const search = parseEmployeeRegistrySearch(rawSearch);
  const [result, t, locale] = await Promise.all([
    listProEmployeeRegistry({ actorProfileId: session.id, tenantSlug: slug, search }),
    getTranslations('pro.employeeRegistry'),
    getLocale(),
  ]);
  if (result.canonicalPage !== search.page)
    redirect(employeeRegistryHref(slug, search, result.canonicalPage));
  const registryDescription =
    result.state === 'data'
      ? t('table.description', { count: result.total })
      : result.state === 'partial'
        ? t('states.partial')
        : result.state === 'no_results'
          ? t('states.emptyFiltered')
          : result.state === 'empty'
            ? t('states.empty')
            : t('states.sanitizedError');
  const labels = {
    eyebrow: t('eyebrow'),
    title: t('title'),
    description: t('description'),
    import: t('import'),
    search: t('filters.search'),
    searchPlaceholder: t('filters.searchPlaceholder'),
    status: t('filters.status'),
    visaFilter: t('filters.visa'),
    eidFilter: t('filters.eid'),
    risk: t('filters.risk'),
    apply: t('filters.apply'),
    reset: t('filters.reset'),
    all: t('filters.all'),
    any: t('filters.any'),
    recorded_expiry: t('filters.recordedExpiry'),
    missing_expiry: t('filters.missingExpiry'),
    active: t('status.active'),
    inactive: t('status.inactive'),
    terminated: t('status.terminated'),
    visa: t('table.visa'),
    eid: t('table.eid'),
    attention: t('risk.attention'),
    total: t('signals.total'),
    visible: t('signals.visible'),
    page: t('signals.page'),
    unavailableValue: t('signals.unavailableValue'),
    table: t('table.label'),
    employee: t('table.employee'),
    notRecorded: t('notRecorded'),
    expiryNotRecorded: t('identity.missing'),
    tableRisk: t('table.risk'),
    provenance: t('table.provenance'),
    phase3Unavailable: t('table.phase3Unavailable'),
    phase3Note: t('table.phase3Note'),
    identifierSurfaceUnavailable: t('table.identifierSurfaceUnavailable'),
    missing: t('identity.missing'),
    expired: t('identity.expired'),
    current: t('identity.current'),
    unavailable_without_masked_contract: t('identity.unavailableWithoutMaskedContract'),
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
          <p className="text-muted-foreground text-sm">{registryDescription}</p>
        </div>
        <EmployeeRegistryTable result={result} labels={labels} locale={locale} />
        <EmployeeRegistryPagination slug={slug} search={search} result={result} labels={labels} />
      </section>
    </div>
  );
}
