import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import {
  customerRenewalHref,
  listCustomerRenewals,
  parseCustomerRenewalSearch,
  type CustomerRenewalResult,
  type CustomerRenewalSearch,
} from '@/lib/data/customer-renewal-workspace';

export const dynamic = 'force-dynamic';

export default async function CustomerRenewalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenant: slug }, raw] = await Promise.all([params, searchParams]);
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const search = parseCustomerRenewalSearch(raw);
  const [workspace, t, locale] = await Promise.all([
    listCustomerRenewals({ tenantSlug: slug, search }, { authorize: async () => access }),
    getTranslations('customer.renewalWorkspace'),
    getLocale(),
  ]);
  if (workspace.canonicalPage !== workspace.page)
    redirect(customerRenewalHref(slug, search, workspace.canonicalPage));

  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  const hasFilters =
    search.bucket !== 'active' || search.type !== 'all' || Boolean(search.q || search.focus);
  const stateCopy =
    workspace.state === 'empty'
      ? (['empty', 'emptyDescription'] as const)
      : workspace.state === 'no-results'
        ? (['noResults', 'noResultsDescription'] as const)
        : workspace.state === 'error'
          ? (['error', 'errorDescription'] as const)
          : workspace.state === 'partial'
            ? (['partial', 'partialDescription'] as const)
            : workspace.state === 'unlinked'
              ? (['unlinked', 'unlinkedDescription'] as const)
              : workspace.state === 'permission'
                ? (['permission', 'permissionDescription'] as const)
                : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{t('description')}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(['overdue', 'due-soon', 'upcoming', 'completed'] as const).map((bucket) => (
          <Link
            key={bucket}
            href={customerRenewalHref(slug, { bucket, type: 'all', q: '', page: 1, focus: null })}
            className="signal-panel focus-visible:ring-ring rounded-lg border p-4 outline-none focus-visible:ring-2"
          >
            <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              {t(bucket === 'due-soon' ? 'dueSoon' : bucket)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {workspace.summaries[bucket] === null
                ? t('unavailable')
                : number.format(workspace.summaries[bucket] ?? 0)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {workspace.summaries[bucket] === null ? t('summaryUnavailable') : t('exactCount')}
            </p>
          </Link>
        ))}
      </div>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('workspace')}</CardTitle>
          <CardDescription>{t('workspaceDescription')}</CardDescription>
          <form method="get" className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              name="bucket"
              value={search.bucket}
              label={t('bucket')}
              options={[
                'active',
                'overdue',
                'due-soon',
                'upcoming',
                'completed',
                'cancelled',
                'missing-date',
              ]}
              labels={{
                active: t('active'),
                overdue: t('overdue'),
                'due-soon': t('dueSoon'),
                upcoming: t('upcoming'),
                completed: t('completed'),
                cancelled: t('cancelled'),
                'missing-date': t('missingDate'),
              }}
            />
            <Select
              name="type"
              value={search.type}
              label={t('type')}
              options={['all', 'license', 'visa', 'eid', 'ejari']}
              labels={{
                all: t('all'),
                license: t('license'),
                visa: t('visa'),
                eid: t('eid'),
                ejari: t('ejari'),
              }}
            />
            <label className="grid gap-1 text-sm">
              <span>{t('search')}</span>
              <input
                name="q"
                defaultValue={search.q}
                maxLength={120}
                className="border-input bg-background h-10 rounded-md border px-3"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit">{t('apply')}</Button>
              {hasFilters ? (
                <Button variant="outline" asChild>
                  <Link
                    href={customerRenewalHref(slug, {
                      bucket: 'active',
                      type: 'all',
                      q: '',
                      page: 1,
                      focus: null,
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
          {stateCopy ? (
            <State
              title={t(stateCopy[0])}
              description={
                workspace.state === 'partial'
                  ? workspace.partialReasons
                      .map((reason) =>
                        t(
                          reason === 'total'
                            ? 'partialTotalDescription'
                            : reason === 'summaries'
                              ? 'partialSummariesDescription'
                              : 'partialEmployeeLabelsDescription',
                        ),
                      )
                      .join(' ')
                  : t(stateCopy[1])
              }
            />
          ) : null}
          {workspace.rows.length ? (
            <RenewalList workspace={workspace} locale={locale} date={date} t={t} />
          ) : null}
          {workspace.total !== null && workspace.total > workspace.pageSize ? (
            <Pagination slug={slug} search={search} workspace={workspace} t={t} />
          ) : null}
        </CardContent>
      </Card>
      <section
        className="signal-panel rounded-lg border p-4"
        aria-labelledby="renewal-unavailable-title"
      >
        <h2 id="renewal-unavailable-title" className="font-semibold">
          {t('futureCapabilities')}
        </h2>
        <ul className="text-muted-foreground mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <li>{t('costUnavailable')}</li>
          <li>{t('remindersUnavailable')}</li>
          <li>{t('deliveryUnavailable')}</li>
          <li>{t('mutationsUnavailable')}</li>
        </ul>
      </section>
    </div>
  );
}

type RenewalT = Awaited<ReturnType<typeof getTranslations<'customer.renewalWorkspace'>>>;
function RenewalList({
  workspace,
  locale,
  date,
  t,
}: {
  workspace: CustomerRenewalResult;
  locale: string;
  date: Intl.DateTimeFormat;
  t: RenewalT;
}) {
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label={t('list')}>
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="px-3 py-2 text-start">{t('item')}</th>
            <th className="px-3 py-2 text-start">{t('entity')}</th>
            <th className="px-3 py-2 text-start">{t('type')}</th>
            <th className="px-3 py-2 text-start">{t('due')}</th>
            <th className="px-3 py-2 text-start">{t('status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {workspace.rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-3">
                <Link
                  href={row.href}
                  className="focus-visible:ring-ring font-medium underline-offset-4 hover:underline focus-visible:ring-2"
                >
                  {row.label}
                </Link>
              </td>
              <td className="px-3 py-3">
                <Badge variant="outline">
                  {t(row.entityKind === 'employee' ? 'employeeEntity' : 'companyEntity')}
                </Badge>
                <p className="mt-1 font-medium">
                  {row.entityLabelState === 'ready' && row.entityLabel
                    ? row.entityLabel
                    : t('entityUnavailable')}
                </p>
              </td>
              <td className="px-3 py-3">{t(row.type)}</td>
              <td className="px-3 py-3">
                {row.dueDate ? date.format(new Date(`${row.dueDate}T00:00:00Z`)) : t('missingDate')}
                {row.daysOut !== null ? (
                  <span className="text-muted-foreground ms-2 text-xs">
                    {t('daysOut', { count: number.format(row.daysOut) })}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <Badge variant={row.bucket === 'overdue' ? 'destructive' : 'secondary'}>
                  {t(
                    row.bucket === 'due-soon'
                      ? 'dueSoon'
                      : row.bucket === 'missing-date'
                        ? 'missingDate'
                        : row.bucket,
                  )}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
function Pagination({
  slug,
  search,
  workspace,
  t,
}: {
  slug: string;
  search: CustomerRenewalSearch;
  workspace: CustomerRenewalResult;
  t: RenewalT;
}) {
  const totalPages = Math.max(1, Math.ceil((workspace.total ?? 0) / workspace.pageSize));
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">
        {t('page', { current: workspace.page, total: totalPages })}
      </span>
      <div className="flex gap-2">
        {workspace.page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={customerRenewalHref(slug, search, workspace.page - 1)}>
              {t('previous')}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            {t('previous')}
          </Button>
        )}
        {workspace.page < totalPages ? (
          <Button variant="outline" asChild>
            <Link href={customerRenewalHref(slug, search, workspace.page + 1)}>{t('next')}</Link>
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
