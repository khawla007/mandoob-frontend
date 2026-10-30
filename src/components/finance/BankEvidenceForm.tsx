import { BankEvidenceUpload } from '@/components/customer/BankEvidenceUpload';

export function BankEvidenceForm({
  tenantSlug,
  invoiceId,
}: {
  tenantSlug: string;
  invoiceId: string;
}) {
  return <BankEvidenceUpload slug={tenantSlug} invoiceId={invoiceId} />;
}
