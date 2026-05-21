import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getProFinanceDashboard } from '@/lib/data/pro-finance';
import type { ProFinanceDashboard } from '@/lib/data/pro-finance';
import { resolveTenantBySlug } from '@/lib/data/tenant';

export const dynamic = 'force-dynamic';

type KpiKey =
  | 'collectedRevenue'
  | 'outstandingReceivables'
  | 'openInvoices'
  | 'overdueInvoices'
  | 'collectionRate';

const kpiCards: Array<{ key: KpiKey; label: string }> = [
  { key: 'collectedRevenue', label: 'Collected revenue' },
  { key: 'outstandingReceivables', label: 'Outstanding receivables' },
  { key: 'openInvoices', label: 'Open invoices' },
  { key: 'overdueInvoices', label: 'Overdue invoices' },
  { key: 'collectionRate', label: 'Collection rate' },
];

export default async function ProPaymentAnalyticsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const dashboard = await getProFinanceDashboard(tenant.id);
  const clientRows = dashboard.revenuePerClient;
  const failedAttempts = dashboard.recentFailedAttempts;

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
          <h1 className="text-2xl font-semibold tracking-tight">Payment analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Operational view of collections, receivables, and failed payment activity.
          </p>
        </div>
        <Button asChild>
          <Link href={`/t/${tenant.slug}/payments`}>Payments</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((kpi) => (
          <Card key={kpi.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{readKpi(dashboard, kpi.key)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue by client</CardTitle>
        </CardHeader>
        <CardContent>
          {clientRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No client revenue activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Invoice count</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Last payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientRows.map((row, index) => (
                  <TableRow key={row.clientId ?? index}>
                    <TableCell className="font-medium">{row.clientName}</TableCell>
                    <TableCell className="text-right">{row.invoiceCount}</TableCell>
                    <TableCell className="text-right">{row.collected}</TableCell>
                    <TableCell className="text-right">{row.outstanding}</TableCell>
                    <TableCell>{row.lastPaymentAt ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent failed and abandoned attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {failedAttempts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No recent failed or abandoned payment attempts.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempted</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedAttempts.map((attempt, index) => (
                  <TableRow key={attempt.id ?? index}>
                    <TableCell className="font-medium">{attempt.clientName}</TableCell>
                    <TableCell>{attempt.invoiceId}</TableCell>
                    <TableCell>{attempt.status}</TableCell>
                    <TableCell>{attempt.createdAt}</TableCell>
                    <TableCell>{attempt.failureReason ?? '-'}</TableCell>
                    <TableCell className="text-right">{attempt.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function readKpi(dashboard: ProFinanceDashboard, key: KpiKey) {
  if (key === 'collectedRevenue') return dashboard.totalRevenueCollected ?? '-';
  if (key === 'outstandingReceivables') return dashboard.outstandingReceivables ?? '-';
  if (key === 'openInvoices') return String(dashboard.openInvoiceCount ?? 0);
  if (key === 'overdueInvoices') return String(dashboard.overdueInvoiceCount ?? 0);

  return dashboard.collectionRateDisplay;
}
