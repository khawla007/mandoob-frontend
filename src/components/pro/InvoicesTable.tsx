import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ProInvoiceRow } from '@/lib/data/invoices';
import { InvoiceActions } from './InvoiceActions';

export function InvoicesTable({ slug, rows }: { slug: string; rows: ProInvoiceRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No invoices yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Button asChild variant="link" className="h-auto p-0 text-left font-medium">
                  <Link href={`/t/${slug}/payments/${row.id}`}>{row.label}</Link>
                </Button>
                <div className="text-muted-foreground font-mono text-xs">{row.id.slice(0, 8)}</div>
              </TableCell>
              <TableCell>
                <Button asChild variant="link" className="h-auto p-0">
                  <Link href={`/t/${slug}/clients/${row.clientId}`}>{row.clientName}</Link>
                </Button>
              </TableCell>
              <TableCell>
                <Badge variant={row.status === 'open' ? 'default' : 'secondary'}>{row.status}</Badge>
              </TableCell>
              <TableCell>{row.dueAt ?? '—'}</TableCell>
              <TableCell className="text-right font-medium">{row.amount}</TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-2">
                  {(row.status === 'paid' || row.status === 'refunded' || row.status === 'partially_refunded') && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/t/${slug}/payments/${row.id}/receipt`} target="_blank">
                        Receipt
                      </Link>
                    </Button>
                  )}
                  <InvoiceActions slug={slug} invoiceId={row.id} amountMinor={row.amountMinor} status={row.status} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
