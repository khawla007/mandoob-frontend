import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CostDataSummaryCard as SummaryCard } from '@/components/admin/CostDataSummaryCard';
import { CostDataDialog } from '@/components/admin/CostDataDialog';
import { CostDataImportDialog } from '@/components/admin/CostDataImportDialog';
import { CostDataStatusButton } from '@/components/admin/CostDataStatusButton';
import { CostDataTable } from '@/components/admin/CostDataTable';
import { requireRole } from '@/lib/auth/require-role';
import { listCostDataRows, getCostDataSummary, type CostDataFilters } from '@/lib/data/cost-data';

export const dynamic = 'force-dynamic';

type SearchParams = {
  jurisdiction?: string;
  q?: string;
  active?: string;
  feeType?: string;
  estimateGrade?: string;
};

export default async function CostDataPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
  const number = new Intl.NumberFormat(await getLocale());
  const sp = await searchParams;
  const filters: CostDataFilters = {
    jurisdiction: sp.jurisdiction ?? 'all',
    q: sp.q ?? '',
    active: parseActive(sp.active),
    feeType: sp.feeType ?? 'all',
    estimateGrade: parseEstimateGrade(sp.estimateGrade),
  };
  const [summary, result] = await Promise.all([getCostDataSummary(), listCostDataRows(filters)]);
  const exportHref = `/admin/cost-data/export?${new URLSearchParams(cleanParams(sp)).toString()}`;

  return (
    <div className="admin-management-signal cost-data-workspace">
      <div className="cost-data-heading">
        <div>
          <p className="cost-data-eyebrow">{t('costData.page.eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('costData.page.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('costData.page.intro')}</p>
        </div>
        <div className="cost-data-heading__actions">
          <CostDataImportDialog />
          <Button asChild variant="outline">
            <Link href={exportHref}>{t('costData.page.exportCsv')}</Link>
          </Button>
          <CostDataDialog mode="create" />
        </div>
      </div>

      <div className="cost-data-summary">
        <SummaryCard
          label={t('costData.page.summaryRows')}
          value={number.format(summary.totalRows)}
          tone="info"
        />
        <SummaryCard
          label={t('costData.page.summaryActive')}
          value={number.format(summary.activeRows)}
          tone="success"
        />
        <SummaryCard
          label={t('costData.page.summaryEstimateGrade')}
          value={number.format(summary.estimateGradeRows)}
          tone="orange"
        />
        <SummaryCard
          label={t('costData.page.summaryAuthorities')}
          value={number.format(summary.uniqueAuthorities)}
          tone="info"
          badge={t('costData.page.summaryExpired', { count: summary.staleRows })}
        />
      </div>

      <Card className="cost-data-panel">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('costData.page.feeRows')}</h2>
            <FilterLinks
              filters={filters}
              label={t('costData.page.statusFilter')}
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
                <CostDataStatusButton id={row.id} active={row.active} />
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FilterLinks({
  filters,
  label,
  labels,
}: {
  filters: CostDataFilters;
  label: string;
  labels: { all: string; active: string; inactive: string };
}) {
  return (
    <nav aria-label={label} className="cost-data-filters">
      <Link aria-current={filters.active === 'all' ? 'page' : undefined} href="/admin/cost-data">
        {labels.all}
      </Link>
      <Link
        aria-current={filters.active === 'active' ? 'page' : undefined}
        href="/admin/cost-data?active=active"
      >
        {labels.active}
      </Link>
      <Link
        aria-current={filters.active === 'inactive' ? 'page' : undefined}
        href="/admin/cost-data?active=inactive"
      >
        {labels.inactive}
      </Link>
    </nav>
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
