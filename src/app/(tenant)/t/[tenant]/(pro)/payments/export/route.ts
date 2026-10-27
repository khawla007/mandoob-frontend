import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { exportFinanceCsv, parseFinanceExportFilters } from '@/lib/finance/exports';

const operationIdSchema = z.string().uuid();

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();
  const url = new URL(request.url);
  const filters = parseFinanceExportFilters(url);
  const operation = operationIdSchema.safeParse(url.searchParams.get('operationId'));
  if (!filters || !operation.success) return privateResponse('Invalid export filters', 400);
  try {
    const csv = await exportFinanceCsv(filters, {
      actorId: session.id,
      tenantId: tenant.id,
      companyId: company.id,
      operationId: operation.data,
    });
    return new Response(csv, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="mandoob-company-finance.csv"',
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
