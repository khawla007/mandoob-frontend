import { NewInvoiceDialog } from '@/components/pro/NewInvoiceDialog';
import type { InvoiceCustomerOption } from '@/lib/data/invoice-customer-options';

export function InvoiceComposer({
  tenantSlug,
  customers,
  triggerLabel,
}: {
  tenantSlug: string;
  customers: InvoiceCustomerOption[];
  triggerLabel?: string;
}) {
  return <NewInvoiceDialog slug={tenantSlug} customers={customers} triggerLabel={triggerLabel} />;
}
