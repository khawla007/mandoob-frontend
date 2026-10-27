import { NextResponse } from 'next/server';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { loadOperationalReport, recordReportExport } from '@/lib/data/reporting-p3-12';
import { ApiError } from '@/lib/errors';
import { encodeCsv } from '@/lib/reporting/csv';
import { validateExportSearchParams } from '@/lib/reporting/runtime-contracts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requirePlatformOperator();
  try {
    validateExportSearchParams(new URL(request.url).searchParams);
    const report = await loadOperationalReport(session.id);
    const rows = Object.entries(report.counts).map(([metric, value]) => ({ metric, value }));
    const csv = encodeCsv(['metric', 'value'], rows);
    await recordReportExport({
      actorId: session.id,
      rowCount: rows.length,
      fileSizeBytes: Buffer.byteLength(csv),
    });
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="mandoob-platform-operations-v1.csv"',
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const invalidFilter = error instanceof ApiError && error.code === 'INVALID_FILTER';
    return NextResponse.json(
      { error: { code: invalidFilter ? 'INVALID_FILTER' : 'REPORT_EXPORT_UNAVAILABLE' } },
      { status: invalidFilter ? 400 : 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
