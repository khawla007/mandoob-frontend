import { notFound } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getReceiptPayloadForTenant } from '@/lib/data/invoices';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { generateReceiptPdf, receiptFilename } from '@/lib/pdf/receipt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const { tenant: slug, invoiceId } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const receipt = await getReceiptPayloadForTenant(tenant.id, company.id, invoiceId);
  if (!receipt) notFound();

  const pdf = await generateReceiptPdf(receipt);
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${receiptFilename(invoiceId)}"`,
      'cache-control': 'private, no-store',
    },
  });
}
