import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('admin');
  const [kpis, rows] = await Promise.all([getFinanceKpis(), getTenantMrrRows()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('finance.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('finance.intro')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.labelKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t(`finance.kpi.${kpi.labelKey}`)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{kpi.value}</div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t(`finance.kpi.${kpi.helperKey}`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('finance.tenantMrr')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('finance.table.tenant')}</TableHead>
                <TableHead>{t('finance.table.plan')}</TableHead>
                <TableHead>{t('finance.table.status')}</TableHead>
                <TableHead>{t('finance.table.periodEnd')}</TableHead>
                <TableHead className="text-right">{t('finance.table.mrr')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tenantId}>
                  <TableCell>
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/admin/pro-firms/${row.tenantId}`}
                    >
                      {row.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">
                    {t.has(`enums.plan.${row.plan}`) ? t(`enums.plan.${row.plan}`) : row.plan}
                  </TableCell>
                  <TableCell>
                    {t.has(`finance.subStatus.${row.status}`)
                      ? t(`finance.subStatus.${row.status}`)
                      : row.status}
                  </TableCell>
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
