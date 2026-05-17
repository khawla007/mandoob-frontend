import { NewInvoiceDialog } from './NewInvoiceDialog';
import { InvoicesTable } from './InvoicesTable';
import type { ProInvoiceRow } from '@/lib/data/invoices';

export function ClientInvoicesPanel({
  slug,
  client,
  invoices,
}: {
  slug: string;
  client: { id: string; company_name: string };
  invoices: ProInvoiceRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Invoices</h2>
          <p className="text-muted-foreground text-sm">Issue invoices and manage payment state.</p>
        </div>
        <NewInvoiceDialog
          slug={slug}
          clients={[{ id: client.id, company_name: client.company_name }]}
          fixedClientId={client.id}
        />
      </div>
      <InvoicesTable slug={slug} rows={invoices} />
    </div>
  );
}
