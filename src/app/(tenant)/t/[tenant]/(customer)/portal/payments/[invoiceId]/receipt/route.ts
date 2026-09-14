import { notFound } from 'next/navigation';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { getReceiptPayloadForCustomer } from '@/lib/data/invoices';
import { generateReceiptPdf, receiptFilename } from '@/lib/pdf/receipt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const { tenant: slug, invoiceId } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  if (access.kind !== 'authorized') notFound();

  const receipt = await getReceiptPayloadForCustomer(
    access.tenant.id,
    access.company.id,
    invoiceId,
    access.session.id,
  );
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
