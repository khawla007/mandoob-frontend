import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import {
  customerEmployeeRegistryHref,
  listCustomerEmployeeRegistry,
  parseCustomerEmployeeRegistrySearch,
  type CustomerEmployeeRegistryResult,
  type CustomerEmployeeSearch,
} from '@/lib/data/customer-employee-registry';

export const dynamic = 'force-dynamic';

export default async function CustomerEmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenant: slug }, raw] = await Promise.all([params, searchParams]);
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const search = parseCustomerEmployeeRegistrySearch(raw);
  const [registry, t, locale] = await Promise.all([
    listCustomerEmployeeRegistry({ tenantSlug: slug, search }, { authorize: async () => access }),
    getTranslations('customer.employeeRegistry'),
    getLocale(),
  ]);
  if (registry.canonicalPage !== registry.page)
    redirect(customerEmployeeRegistryHref(slug, search, registry.canonicalPage));
  const number = new Intl.NumberFormat(locale);
  const hasFilters =
    search.q ||
    search.status !== 'all' ||
    search.expiry !== 'all' ||
    search.sort !== 'name' ||
    search.direction !== 'asc';
  const stateCopy =
    registry.state === 'empty'
      ? (['empty', 'emptyDescription'] as const)
      : registry.state === 'no-results'
        ? (['noResults', 'noResultsDescription'] as const)
        : registry.state === 'error'
          ? (['error', 'errorDescription'] as const)
          : registry.state === 'partial'
            ? (['partial', 'partialDescription'] as const)
            : registry.state === 'unlinked'
              ? (['unlinked', 'unlinkedDescription'] as const)
              : registry.state === 'permission'
                ? (['permission', 'permissionDescription'] as const)
                : null;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{t('description')}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Signal
          label={t('total')}
          value={
            registry.unfilteredTotal === null
              ? t('unavailable')
              : number.format(registry.unfilteredTotal)
          }
        />
        <Signal
          label={t('filtered')}
          value={registry.total === null ? t('unavailable') : number.format(registry.total)}
        />
        <Signal
          label={t('visible')}
          value={
            registry.state === 'error' ||
            registry.state === 'unlinked' ||
            registry.state === 'permission'
              ? t('unavailable')
              : number.format(registry.rows.length)
          }
        />
      </div>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('workspace')}</CardTitle>
          <CardDescription>{t('workspaceDescription')}</CardDescription>
          <form method="get" className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="grid gap-1 text-sm xl:col-span-2">
              <span>{t('search')}</span>
              <input
                className="border-input bg-background h-10 rounded-md border px-3"
                name="q"
                defaultValue={search.q}
                maxLength={120}
              />
            </label>
            <Select
              name="status"
              value={search.status}
              label={t('status')}
              options={['all', 'active', 'inactive', 'terminated']}
              labels={{
                all: t('all'),
                active: t('active'),
                inactive: t('inactive'),
                terminated: t('terminated'),
              }}
            />
            <Select
              name="expiry"
              value={search.expiry}
              label={t('expiry')}
              options={['all', 'attention', 'missing']}
              labels={{ all: t('all'), attention: t('attention'), missing: t('missing') }}
            />
            <Select
              name="sort"
              value={search.sort}
              label={t('sort')}
              options={['name', 'visa_expiry', 'eid_expiry']}
              labels={{ name: t('name'), visa_expiry: t('visaExpiry'), eid_expiry: t('eidExpiry') }}
            />
            <Select
              name="direction"
              value={search.direction}
              label={t('direction')}
              options={['asc', 'desc']}
              labels={{ asc: t('ascending'), desc: t('descending') }}
            />
            <div className="flex gap-2 sm:col-span-2 xl:col-span-6">
              <Button type="submit">{t('apply')}</Button>
              {hasFilters ? (
                <Button variant="outline" asChild>
                  <Link
                    href={customerEmployeeRegistryHref(slug, {
                      q: '',
                      status: 'all',
                      expiry: 'all',
                      sort: 'name',
                      direction: 'asc',
                      page: 1,
                    })}
                  >
                    {t('reset')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          {stateCopy ? <State title={t(stateCopy[0])} description={t(stateCopy[1])} /> : null}
          {registry.rows.length ? (
            <EmployeeTable registry={registry} locale={locale} t={t} />
          ) : null}
          {registry.total !== null && registry.total > registry.pageSize ? (
            <Pagination slug={slug} search={search} registry={registry} t={t} />
          ) : null}
        </CardContent>
      </Card>
      <section
        className="signal-panel rounded-lg border p-4"
        aria-labelledby="employee-boundary-title"
      >
        <h2 id="employee-boundary-title" className="font-semibold">
          {t('dataBoundary')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('identifiersUnavailable')}</p>
        <p className="text-muted-foreground mt-1 text-sm">{t('mutationsUnavailable')}</p>
      </section>
    </div>
  );
}

type EmployeeT = Awaited<ReturnType<typeof getTranslations<'customer.employeeRegistry'>>>;
function Signal({ label, value }: { label: string; value: string }) {
  return (
    <section className="signal-panel rounded-lg border p-4">
      <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </section>
  );
}
function Select({
  name,
  value,
  label,
  options,
  labels,
}: {
  name: string;
  value: string;
  label: string;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background h-10 rounded-md border px-3"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
function State({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}
function EmployeeTable({
  registry,
  locale,
  t,
}: {
  registry: CustomerEmployeeRegistryResult;
  locale: string;
  t: EmployeeT;
}) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  const expiry = (value: string | null) =>
    value ? date.format(new Date(`${value}T00:00:00Z`)) : t('notRecorded');
  return (
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label={t('list')}>
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="px-3 py-2 text-start">{t('name')}</th>
            <th className="px-3 py-2 text-start">{t('nationality')}</th>
            <th className="px-3 py-2 text-start">{t('status')}</th>
            <th className="px-3 py-2 text-start">{t('visaExpiry')}</th>
            <th className="px-3 py-2 text-start">{t('eidExpiry')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {registry.rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-3 font-medium">{row.name}</td>
              <td className="px-3 py-3">{row.nationality ?? t('notRecorded')}</td>
              <td className="px-3 py-3">
                <Badge variant="secondary">{t(row.status)}</Badge>
              </td>
              <td className="px-3 py-3">
                {expiry(row.visaExpiry)}
                <div className="text-muted-foreground text-xs">{t(row.visaState)}</div>
              </td>
              <td className="px-3 py-3">
                {expiry(row.eidExpiry)}
                <div className="text-muted-foreground text-xs">{t(row.eidState)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pagination({
  slug,
  search,
  registry,
  t,
}: {
  slug: string;
  search: CustomerEmployeeSearch;
  registry: CustomerEmployeeRegistryResult;
  t: EmployeeT;
}) {
  const pages = Math.max(1, Math.ceil((registry.total ?? 0) / registry.pageSize));
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">
        {t('page', { current: registry.page, total: pages })}
      </span>
      <div className="flex gap-2">
        {registry.page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={customerEmployeeRegistryHref(slug, search, registry.page - 1)}>
              {t('previous')}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            {t('previous')}
          </Button>
        )}
        {registry.page < pages ? (
          <Button variant="outline" asChild>
            <Link href={customerEmployeeRegistryHref(slug, search, registry.page + 1)}>
              {t('next')}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            {t('next')}
          </Button>
        )}
      </div>
    </nav>
  );
}
