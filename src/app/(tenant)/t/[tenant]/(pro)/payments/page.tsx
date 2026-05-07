import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewInvoiceDialog } from '@/components/pro/NewInvoiceDialog';
import { InvoicesTable } from '@/components/pro/InvoicesTable';
import { listClientsForPro } from '@/lib/data/clients-list';
import { listInvoicesForTenant } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';

export const dynamic = 'force-dynamic';

export default async function ProPaymentsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [clients, invoices] = await Promise.all([
    listClientsForPro({ tenantId: tenant.id }),
    listInvoicesForTenant(tenant.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Issue invoices, track pending payments, and manage receipts.
          </p>
        </div>
        <NewInvoiceDialog slug={tenant.slug} clients={clients} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoicesTable slug={tenant.slug} rows={invoices} />
        </CardContent>
      </Card>
    </div>
  );
}
