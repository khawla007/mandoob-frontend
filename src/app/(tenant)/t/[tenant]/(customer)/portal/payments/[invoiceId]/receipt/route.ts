import { notFound } from 'next/navigation';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import {
  loadAuthoritativeReceipt,
  parseReceiptSelection,
  receiptDownloadHeaders,
  receiptSnapshotToPdfInput,
} from '@/lib/finance/receipts';
import { generateReceiptPdf } from '@/lib/pdf/receipt';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; invoiceId: string }> },
) {
  const { tenant: slug, invoiceId } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  if (access.kind !== 'authorized') notFound();
  const selection = parseReceiptSelection(new URL(request.url), invoiceId);
  if (!selection) notFound();
  const receipt = await loadAuthoritativeReceipt({
    tenantId: access.tenant.id,
    companyId: access.company.id,
    actorId: access.session.id,
    actorRole: 'customer',
    invoiceId,
    selection,
  });
  if (!receipt) notFound();

  const pdf = await generateReceiptPdf(receiptSnapshotToPdfInput(receipt));
  return new Response(Buffer.from(pdf), {
    headers: receiptDownloadHeaders(receipt.receiptKind, receipt.receiptId),
  });
}
