import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default async function CostDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole('super_admin', 'admin');
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cost data</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage estimator fee rows used by public setup quotes.
          </p>
        </div>
        <div className="flex gap-2">
          <CostDataImportDialog />
          <Button asChild variant="outline">
            <Link href={exportHref}>Export CSV</Link>
          </Button>
          <CostDataDialog mode="create" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Rows" value={summary.totalRows} />
        <SummaryCard label="Active" value={summary.activeRows} />
        <SummaryCard label="Estimate-grade" value={summary.estimateGradeRows} />
        <SummaryCard label="Authorities" value={summary.uniqueAuthorities} badge={`${summary.staleRows} expired`} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Fee rows</CardTitle>
            <FilterLinks filters={filters} />
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

function FilterLinks({ filters }: { filters: CostDataFilters }) {
  return (
    <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
      <Link className={filters.active === 'all' ? 'text-foreground font-medium' : ''} href="/admin/cost-data">
        All
      </Link>
      <Link className={filters.active === 'active' ? 'text-foreground font-medium' : ''} href="/admin/cost-data?active=active">
        Active
      </Link>
      <Link className={filters.active === 'inactive' ? 'text-foreground font-medium' : ''} href="/admin/cost-data?active=inactive">
        Inactive
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
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
