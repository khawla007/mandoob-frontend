import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CostDataDialog } from '@/components/admin/CostDataDialog';
import { CostDataImportDialog } from '@/components/admin/CostDataImportDialog';
import { CostDataStatusButton } from '@/components/admin/CostDataStatusButton';
import { CostDataTable } from '@/components/admin/CostDataTable';
import { requireRole } from '@/lib/auth/require-role';
import { listCostDataRows, getCostDataSummary, type CostDataFilters } from '@/lib/data/cost-data';
import { COST_DATA_PAGE_SIZE, costDataPageHref, parseCostDataPage } from './pagination';

export const dynamic = 'force-dynamic';

type SearchParams = {
  jurisdiction?: string;
  q?: string;
  active?: string;
  feeType?: string;
  estimateGrade?: string;
  page?: string;
};

export default async function CostDataPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
  const sp = await searchParams;
  const filters: CostDataFilters = {
    jurisdiction: sp.jurisdiction ?? 'all',
    q: sp.q ?? '',
    active: parseActive(sp.active),
    feeType: sp.feeType ?? 'all',
    estimateGrade: parseEstimateGrade(sp.estimateGrade),
    page: positivePage(sp.page),
    pageSize: COST_DATA_PAGE_SIZE,
  };
  const [summary, result] = await Promise.all([getCostDataSummary(), listCostDataRows(filters)]);
  const pagination = parseCostDataPage(sp.page, result.count);
  if (pagination.page !== filters.page) redirect(costDataPageHref(sp, pagination.page));
  const exportHref = `/admin/cost-data/export?${new URLSearchParams(cleanParams(sp)).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('costData.page.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('costData.page.intro')}</p>
        </div>
        <div className="flex gap-2">
          <CostDataImportDialog />
          <Button asChild variant="outline">
            <Link href={exportHref}>{t('costData.page.exportCsv')}</Link>
          </Button>
          <CostDataDialog mode="create" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label={t('costData.page.summaryRows')} value={summary.totalRows} />
        <SummaryCard label={t('costData.page.summaryActive')} value={summary.activeRows} />
        <SummaryCard
          label={t('costData.page.summaryEstimateGrade')}
          value={summary.estimateGradeRows}
        />
        <SummaryCard
          label={t('costData.page.summaryAuthorities')}
          value={summary.uniqueAuthorities}
          badge={t('costData.page.summaryExpired', { count: summary.staleRows })}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">{t('costData.page.feeRows')}</CardTitle>
            <FilterLinks
              filters={filters}
              labels={{
                all: t('costData.page.filterAll'),
                active: t('costData.page.filterActive'),
                inactive: t('costData.page.filterInactive'),
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <CostDataTable
            rows={result.rows}
            renderActions={(row) => (
              <div className="flex justify-end gap-2">
                <CostDataDialog mode="edit" row={row} />
                <CostDataStatusButton id={row.id} active={row.active} rowVersion={row.rowVersion} />
              </div>
            )}
          />
          <nav
            aria-label={t('costData.page.paginationLabel')}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {t('costData.page.paginationSummary', {
                page: pagination.page,
                pageCount: pagination.pageCount,
                total: result.count,
              })}
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" disabled={pagination.page <= 1}>
                <Link
                  href={costDataPageHref(sp, pagination.page - 1)}
                  aria-disabled={pagination.page <= 1}
                  tabIndex={pagination.page <= 1 ? -1 : undefined}
                >
                  {t('costData.page.previous')}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pageCount}
              >
                <Link
                  href={costDataPageHref(sp, pagination.page + 1)}
                  aria-disabled={pagination.page >= pagination.pageCount}
                  tabIndex={pagination.page >= pagination.pageCount ? -1 : undefined}
                >
                  {t('costData.page.next')}
                </Link>
              </Button>
            </div>
          </nav>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, badge }: { label: string; value: number; badge?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-2xl font-semibold">{value}</div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </CardContent>
    </Card>
  );
}

function FilterLinks({
  filters,
  labels,
}: {
  filters: CostDataFilters;
  labels: { all: string; active: string; inactive: string };
}) {
  return (
    <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
      <Link
        className={filters.active === 'all' ? 'text-foreground font-medium' : ''}
        href="/admin/cost-data"
      >
        {labels.all}
      </Link>
      <Link
        className={filters.active === 'active' ? 'text-foreground font-medium' : ''}
        href="/admin/cost-data?active=active"
      >
        {labels.active}
      </Link>
      <Link
        className={filters.active === 'inactive' ? 'text-foreground font-medium' : ''}
        href="/admin/cost-data?active=inactive"
      >
        {labels.inactive}
      </Link>
    </div>
  );
}

function parseActive(value: string | undefined): 'all' | 'active' | 'inactive' {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function parseEstimateGrade(value: string | undefined): 'all' | 'yes' | 'no' {
  return value === 'yes' || value === 'no' ? value : 'all';
}

function cleanParams(params: SearchParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function positivePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
