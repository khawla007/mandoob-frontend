import { notFound } from 'next/navigation';
import { requireTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getReceiptPayloadForCustomer } from '@/lib/data/invoices';
import { generateReceiptPdf, receiptFilename } from '@/lib/pdf/receipt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const { tenant: slug, invoiceId } = await params;
  const { tenant, session } = await requireTenantRouteAccess(slug, ['customer']);

  const receipt = await getReceiptPayloadForCustomer(tenant.id, invoiceId, session.id);
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
