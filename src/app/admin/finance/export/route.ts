import { requirePlatformOperator } from '@/lib/auth/require-role';
import { exportFinanceCsv, parseFinanceExportFilters } from '@/lib/finance/exports';

export async function GET(request: Request) {
  const actor = await requirePlatformOperator();
  const filters = parseFinanceExportFilters(new URL(request.url));
  if (!filters) return privateResponse('Invalid export filters', 400);
  try {
    const csv = await exportFinanceCsv(filters, {
      actorId: actor.id,
      tenantId: null,
      companyId: null,
      operationId: null,
    });
    return new Response(csv, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="mandoob-finance.csv"',
        'content-type': 'text/csv; charset=utf-8',
      },
    });
  } catch {
    return privateResponse('Finance export unavailable', 503);
  }
}

function privateResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
