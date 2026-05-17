import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { listCostDataRowsForExport } from '@/lib/data/cost-data';
import { costDataRowsToCsv } from '@/lib/validation/cost-data';

export async function GET(request: Request) {
  await requireRole('super_admin', 'admin');
  const url = new URL(request.url);
  const rows = await listCostDataRowsForExport({
    jurisdiction: url.searchParams.get('jurisdiction'),
    q: url.searchParams.get('q'),
    active: (url.searchParams.get('active') as 'all' | 'active' | 'inactive' | null) ?? 'all',
    feeType: url.searchParams.get('feeType'),
    estimateGrade: (url.searchParams.get('estimateGrade') as 'all' | 'yes' | 'no' | null) ?? 'all',
  });

  return new NextResponse(costDataRowsToCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="mandoob-cost-data.csv"',
    },
  });
}
