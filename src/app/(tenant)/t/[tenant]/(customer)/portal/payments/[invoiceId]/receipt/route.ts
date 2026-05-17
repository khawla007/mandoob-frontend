import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { getReceiptPayloadForCustomer } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { generateReceiptPdf, receiptFilename } from '@/lib/pdf/receipt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const session = await requireRole('customer');
  const { tenant: slug, invoiceId } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || session.tenantId !== tenant.id) notFound();

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
