import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewInvoiceDialog } from '@/components/pro/NewInvoiceDialog';
import { InvoicesTable } from '@/components/pro/InvoicesTable';
import { listClientsForPro } from '@/lib/data/clients-list';
import { listInvoicesForPaymentView } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { parsePaymentView, paymentViewHref, type PaymentView } from './page-logic';

export const dynamic = 'force-dynamic';

const PAYMENT_VIEWS: Array<{ value: PaymentView; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'billed', label: 'Billed this month' },
  { value: 'paid', label: 'Paid this month' },
  { value: 'due-soon', label: 'Due within 30 days' },
  { value: 'overdue', label: 'Overdue' },
];

export default async function ProPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ view?: string | string[]; page?: string | string[] }>;
}) {
  const { tenant: slug } = await params;
  const search = await searchParams;
  const view = parsePaymentView(search.view);
  const rawPage = Array.isArray(search.page) ? search.page[0] : search.page;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [clients, invoicePage] = await Promise.all([
    listClientsForPro({ tenantId: tenant.id }),
    listInvoicesForPaymentView(tenant.id, { view, page }),
  ]);
  const activeView = PAYMENT_VIEWS.find((item) => item.value === view)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Issue invoices, track pending payments, and manage receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button asChild variant="outline">
            <Link href={`/t/${tenant.slug}/payments/analytics`}>Analytics</Link>
          </Button>
          <NewInvoiceDialog slug={tenant.slug} clients={clients} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{activeView.label} invoices</CardTitle>
          <nav
            aria-label="Filter invoices by collection category"
            className="flex flex-wrap gap-2 pt-2"
          >
            {PAYMENT_VIEWS.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={view === item.value ? 'default' : 'outline'}
              >
                <Link
                  href={paymentViewHref(tenant.slug, item.value)}
                  aria-current={view === item.value ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <InvoicesTable
            slug={tenant.slug}
            rows={invoicePage.rows}
            emptyMessage={`No ${activeView.label.toLocaleLowerCase('en-US')} invoices match this view.`}
          />
          {invoicePage.total > invoicePage.pageSize ? (
            <nav
              aria-label="Invoice pages"
              className="mt-4 flex items-center justify-between text-sm"
            >
              {page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`${paymentViewHref(tenant.slug, view)}${view === 'all' ? '?' : '&'}page=${page - 1}`}
                  >
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Previous
                </Button>
              )}
              <span>
                {page} / {Math.ceil(invoicePage.total / invoicePage.pageSize)}
              </span>
              {page * invoicePage.pageSize < invoicePage.total ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`${paymentViewHref(tenant.slug, view)}${view === 'all' ? '?' : '&'}page=${page + 1}`}
                  >
                    Next
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Next
                </Button>
              )}
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
