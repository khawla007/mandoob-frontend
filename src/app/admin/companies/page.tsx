import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Building2, CircleUserRound, Plus, Search } from 'lucide-react';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { listCompanies, type CompanyStatus } from '@/lib/data/pro-firms';
import {
  canonicalCompanyListHref,
  companyListHref,
  parseCompanyListQuery,
  type RawCompanyListQuery,
} from './company-list-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompanyAppliedFilters } from '@/components/admin/CompanyAppliedFilters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const COMPANY_STATUSES: CompanyStatus[] = [
  'onboarding',
  'active',
  'renewal_due',
  'renewal_overdue',
  'suspended',
  'churned',
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<RawCompanyListQuery>;
}) {
  await requirePlatformOperator();
  const [t, locale, sp] = await Promise.all([
    getTranslations('admin.companies'),
    getLocale(),
    searchParams,
  ]);
  const listQuery = parseCompanyListQuery(sp);
  const companies = await listCompanies(listQuery);
  const canonicalHref = canonicalCompanyListHref(listQuery, companies.totalPages);
  if (canonicalHref) redirect(canonicalHref);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
            {t('page.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('page.intro', { count: companies.total })}
          </p>
        </div>
        <Button asChild className="min-h-11 sm:min-h-9">
          <Link href="/admin/companies/new">
            <Plus aria-hidden="true" />
            {t('page.createButton')}
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-border/60 border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>{t('directory.title')}</CardTitle>
              <CardDescription>{t('directory.description')}</CardDescription>
            </div>
            <form method="get" className="flex w-full gap-2 lg:max-w-md">
              {listQuery.status !== 'all' ? (
                <input type="hidden" name="status" value={listQuery.status} />
              ) : null}
              {listQuery.tenantId ? (
                <input type="hidden" name="tenant" value={listQuery.tenantId} />
              ) : null}
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Label htmlFor="company-search" className="sr-only">
                  {t('directory.searchLabel')}
                </Label>
                <Input
                  id="company-search"
                  name="q"
                  defaultValue={listQuery.q ?? ''}
                  placeholder={t('directory.searchPlaceholder')}
                />
              </div>
              <Button type="submit" variant="outline" className="min-h-11 sm:min-h-9">
                <Search aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t('directory.searchSubmit')}</span>
              </Button>
            </form>
          </div>
          <nav className="flex flex-wrap gap-2 pt-2" aria-label={t('directory.statusFilterLabel')}>
            {(['all', ...COMPANY_STATUSES] as const).map((value) => {
              const active = listQuery.status === value;
              return (
                <Button key={value} asChild size="sm" variant={active ? 'default' : 'outline'}>
                  <Link href={companyListHref({ ...listQuery, status: value, page: 1 }, 1)}>
                    {value === 'all' ? t('status.all') : t(`status.${value}`)}
                  </Link>
                </Button>
              );
            })}
          </nav>
          <CompanyAppliedFilters
            query={listQuery}
            labels={{
              heading: t('directory.appliedFilters'),
              search: t('directory.searchFilter', { value: listQuery.q ?? '' }),
              status: t('directory.statusFilter', {
                value:
                  listQuery.status === 'all' ? t('status.all') : t(`status.${listQuery.status}`),
              }),
              tenant: t('directory.tenantFilter', { value: listQuery.tenantId ?? '' }),
              reset: t('directory.resetFilters'),
            }}
          />
        </CardHeader>
        <CardContent className="p-0">
          {companies.rows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Building2 className="text-muted-foreground/55 size-9" aria-hidden="true" />
              <p className="mt-3 font-medium">{t('directory.emptyTitle')}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('directory.emptyDescription')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label={t('directory.tableLabel')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.company')}</TableHead>
                    <TableHead>{t('table.workspace')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                    <TableHead>{t('table.pro')}</TableHead>
                    <TableHead>{t('table.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.rows.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="min-w-56">
                        <Link
                          href={`/admin/companies/${company.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs" dir="ltr">
                          {company.tradeLicenseNo ?? t('table.noLicense')}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <span className="text-sm">{company.workspaceName}</span>
                        <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                          {company.tenantSlug}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.companyStatus === 'active' ? 'default' : 'outline'}>
                          {t(`status.${company.companyStatus}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <span className="inline-flex items-center gap-2 text-sm">
                          <CircleUserRound
                            className="text-muted-foreground size-4"
                            aria-hidden="true"
                          />
                          {company.currentProName ?? t('table.unassigned')}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {date.format(new Date(company.createdAt))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {companies.total > 0 ? (
          <div className="border-border/60 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {t('directory.paginationSummary', {
                page: companies.page,
                totalPages: companies.totalPages,
                total: companies.total,
              })}
            </p>
            <nav className="flex gap-2" aria-label={t('directory.paginationLabel')}>
              {companies.page > 1 ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Link href={companyListHref(listQuery, companies.page - 1)}>
                    {t('directory.previous')}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="min-h-11 sm:min-h-9">
                  {t('directory.previous')}
                </Button>
              )}
              {companies.page < companies.totalPages ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Link href={companyListHref(listQuery, companies.page + 1)}>
                    {t('directory.next')}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="min-h-11 sm:min-h-9">
                  {t('directory.next')}
                </Button>
              )}
            </nav>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
