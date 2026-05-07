import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceActions } from '@/components/pro/InvoiceActions';
import { getInvoiceDetailForTenant } from '@/lib/data/invoices';
import { resolveTenantBySlug } from '@/lib/data/tenant';

export const dynamic = 'force-dynamic';

export default async function ProInvoiceDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; invoiceId: string }>;
}) {
  const { tenant: slug, invoiceId } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const invoice = await getInvoiceDetailForTenant(tenant.id, invoiceId);
  if (!invoice) notFound();

  const canShowReceipt =
    invoice.status === 'paid' ||
    invoice.status === 'refunded' ||
    invoice.status === 'partially_refunded';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/t/${tenant.slug}/payments`}>
          <ChevronLeft className="size-4" />
          Back to payments
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.label}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={invoice.status === 'open' ? 'default' : 'secondary'}>
              {invoice.status}
            </Badge>
            <span className="text-muted-foreground">{invoice.amount}</span>
            <span className="text-muted-foreground">· {invoice.clientName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canShowReceipt && (
            <Button asChild variant="outline">
              <Link href={`/t/${tenant.slug}/payments/${invoice.id}/receipt`} target="_blank">
                Receipt
              </Link>
            </Button>
          )}
          <InvoiceActions
            slug={tenant.slug}
            invoiceId={invoice.id}
            amountMinor={invoice.amountMinor}
            status={invoice.status}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Invoice ID" value={invoice.id} mono />
            <Field label="Client" value={invoice.clientName} />
            <Field label="Customer profile" value={invoice.customerProfileId ?? '—'} mono />
            <Field label="Due date" value={invoice.dueAt ?? '—'} />
            <Field label="Paid at" value={invoice.paidAt ?? '—'} />
            <Field
              label="Linked entity"
              value={
                invoice.linkedEntityType
                  ? `${invoice.linkedEntityType}:${invoice.linkedEntityId ?? '—'}`
                  : '—'
              }
              mono
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payment attempts recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.provider}</TableCell>
                    <TableCell>{payment.status}</TableCell>
                    <TableCell>{payment.method ?? '—'}</TableCell>
                    <TableCell>{payment.receivedAt ?? payment.failureReason ?? '—'}</TableCell>
                    <TableCell className="text-right">{payment.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Refunds</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.refunds.length === 0 ? (
            <p className="text-muted-foreground text-sm">No refunds recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>{refund.status}</TableCell>
                    <TableCell>{refund.reason ?? '—'}</TableCell>
                    <TableCell>{refund.createdAt}</TableCell>
                    <TableCell className="text-right">{refund.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent audit</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.audit.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit entries found.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {invoice.audit.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-2 first:pt-0">
                  <span className="font-medium">{entry.action}</span>
                  <span className="text-muted-foreground">{entry.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono' : 'font-medium'}>{value}</dd>
    </div>
  );
}
