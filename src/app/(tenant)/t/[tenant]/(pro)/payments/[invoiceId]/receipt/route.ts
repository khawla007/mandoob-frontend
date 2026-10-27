import { notFound } from 'next/navigation';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
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
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();
  const selection = parseReceiptSelection(new URL(request.url), invoiceId);
  if (!selection) notFound();
  const receipt = await loadAuthoritativeReceipt({
    tenantId: tenant.id,
    companyId: company.id,
    actorId: session.id,
    actorRole: 'pro',
    invoiceId,
    selection,
  });
  if (!receipt) notFound();

  const pdf = await generateReceiptPdf(receiptSnapshotToPdfInput(receipt));
  return new Response(Buffer.from(pdf), {
    headers: receiptDownloadHeaders(receipt.receiptKind, receipt.receiptId),
  });
}
