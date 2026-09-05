import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProInvoiceRow } from '@/lib/data/invoices';
import { formatFinanceDate } from '@/lib/format/finance-date';
import { InvoiceActions } from './InvoiceActions';

export function InvoicesTable({
  slug,
  rows,
  emptyMessage = 'No invoices yet.',
}: {
  slug: string;
  rows: ProInvoiceRow[];
  emptyMessage?: string;
}) {
  const t = useTranslations('pro');
  const locale = useLocale();
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('paymentInvoice')}</TableHead>
            <TableHead>{t('paymentStatus')}</TableHead>
            <TableHead>{t('paymentDue')}</TableHead>
            <TableHead className="text-right">{t('paymentAmount')}</TableHead>
            <TableHead className="text-right">{t('paymentActions')}</TableHead>
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
                <Badge variant={row.status === 'open' ? 'default' : 'secondary'}>
                  {invoiceStatusLabel(row.status, t)}
                </Badge>
              </TableCell>
              <TableCell>
                {formatFinanceDate(row.dueAt, locale, t('paymentDateUnavailable'))}
              </TableCell>
              <TableCell className="text-right font-medium">{row.amount}</TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-2">
                  {(row.status === 'paid' ||
                    row.status === 'refunded' ||
                    row.status === 'partially_refunded') && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/t/${slug}/payments/${row.id}/receipt`} target="_blank">
                        {t('paymentReceipt')}
                      </Link>
                    </Button>
                  )}
                  <InvoiceActions
                    slug={slug}
                    invoiceId={row.id}
                    amountMinor={row.amountMinor}
                    currency={row.currency}
                    remainingRefundableMinor={row.remainingRefundableMinor}
                    status={row.status}
                    refundOperation={row.refundOperation}
                    refundAvailable={row.refundAvailable}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function invoiceStatusLabel(status: string, t: ReturnType<typeof useTranslations<'pro'>>) {
  const known: Record<string, string> = {
    draft: 'paymentStatusDraft',
    open: 'paymentStatusOpen',
    paid: 'paymentStatusPaid',
    void: 'paymentStatusVoid',
    refunded: 'paymentStatusRefunded',
    partially_refunded: 'paymentStatusPartiallyRefunded',
  };
  return known[status] ? t(known[status]) : t('paymentValueUnavailable');
}
