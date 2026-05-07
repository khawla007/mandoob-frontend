import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { getReceiptPayloadForTenant } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { generateReceiptPdf, receiptFilename } from '@/lib/pdf/receipt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const session = await requireRole('pro', 'admin', 'super_admin');
  const { tenant: slug, invoiceId } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  if (session.role !== 'super_admin' && session.tenantId !== tenant.id) notFound();

  const receipt = await getReceiptPayloadForTenant(tenant.id, invoiceId);
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
