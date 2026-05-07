import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getFinanceKpis, getTenantMrrRows } from '@/lib/data/finance';

export const dynamic = 'force-dynamic';

export default async function AdminFinancePage() {
  const [kpis, rows] = await Promise.all([getFinanceKpis(), getTenantMrrRows()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="text-muted-foreground mt-1 text-sm">Stripe subscription revenue.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{kpi.value}</div>
              <p className="text-muted-foreground mt-1 text-xs">{kpi.helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant MRR</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period end</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tenantId}>
                  <TableCell>
                    <Link className="underline-offset-4 hover:underline" href={`/admin/pro-firms/${row.tenantId}`}>
                      {row.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{row.plan}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    {row.currentPeriodEnd
                      ? new Date(row.currentPeriodEnd).toLocaleDateString('en-GB')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">{row.mrr}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
