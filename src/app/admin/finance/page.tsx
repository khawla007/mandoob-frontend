import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { AdminUnavailableAction } from '@/components/admin/management/AdminUnavailableAction';
import { AdminUnavailableWorkspace } from '@/components/admin/management/AdminUnavailableWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
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
import { requirePlatformOperator } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function AdminFinancePage() {
  await requirePlatformOperator();
  const [t, locale] = await Promise.all([getTranslations('admin'), getLocale()]);
  const [kpis, rows] = await Promise.all([getFinanceKpis(), getTenantMrrRows()]);
  const pointInTime = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <DashboardPageHeader title={t('finance.title')} description={t('finance.intro')} />

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <span className="text-muted-foreground">{t('finance.pointInTime')}:</span> {pointInTime}
          </p>
          <p>
            <span className="text-muted-foreground">{t('finance.currencyUsd')}:</span> USD
          </p>
          <p>
            <span className="text-muted-foreground">{t('finance.includedActive')}:</span>{' '}
            {t('finance.activeSubscriptionsOnly')}
          </p>
          <p>
            <span className="text-muted-foreground">{t('finance.excludedStatuses')}:</span>{' '}
            {t('finance.nonActiveExcluded')}
          </p>
        </CardContent>
      </Card>

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
                      href={`/admin/companies?tenant=${row.tenantId}`}
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
                    {row.currentPeriodEnd ? date.format(new Date(row.currentPeriodEnd)) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{row.mrr}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdminUnavailableWorkspace
        title={t('finance.unsupported.title')}
        description={t('finance.unsupported.description')}
        unavailableTitle={t('finance.unsupported.unavailableTitle')}
        unavailableDescription={t('finance.unsupported.unavailableDescription')}
        guidance={t('finance.unsupported.guidance')}
      />
      <AdminUnavailableAction
        label={t('finance.unsupported.export')}
        explanation={t('finance.unsupported.exportExplanation')}
      />
    </div>
  );
}
