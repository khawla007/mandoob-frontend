import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
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
import { getTenantMrrRows } from '@/lib/data/finance';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { listBankEvidenceReviewQueue } from '@/lib/finance/bank-evidence-review';
import { BankEvidenceReviewPanel } from '@/components/finance/BankEvidenceReviewPanel';
import { openAdminBankEvidenceAction, reviewAdminBankEvidenceAction } from './actions';
import {
  dubaiMonthKey,
  dubaiMonthRange,
  loadFinanceReport,
  loadSubscriptionReport,
} from '@/lib/finance/reports';
import { formatMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

export default async function AdminFinancePage() {
  const actor = await requirePlatformOperator();
  const month = dubaiMonthKey();
  const period = dubaiMonthRange(month)!;
  const [t, locale] = await Promise.all([getTranslations('admin'), getLocale()]);
  const [rows, evidenceRows, accounting, subscriptions] = await Promise.all([
    getTenantMrrRows(),
    listBankEvidenceReviewQueue({}),
    loadFinanceReport({ actorId: actor.id, tenantId: null, companyId: null, period }),
    loadSubscriptionReport(actor.id, period),
  ]);
  const pointInTime = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date());
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  });

  return (
    <div className="admin-management-signal finance-management-workspace admin-operational-workspace space-y-6">
      <DashboardPageHeader
        eyebrow={t('finance.eyebrow')}
        title={t('finance.title')}
        description={t('finance.intro')}
        className="admin-operational-heading"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('finance.reportTitle', { month })}</CardTitle>
          <Button asChild variant="outline">
            <Link href={`/admin/finance/export?month=${month}`}>{t('finance.exportCsv')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-x-auto"
            role="region"
            aria-label={t('finance.accountingTable')}
            tabIndex={0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('finance.currency')}</TableHead>
                  <TableHead className="text-right">{t('finance.cashCollected')}</TableHead>
                  <TableHead className="text-right">{t('finance.billed')}</TableHead>
                  <TableHead className="text-right">{t('finance.receivable')}</TableHead>
                  <TableHead className="text-right">{t('finance.profit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(accounting.currencies).map(([currency, report]) => (
                  <TableRow key={currency}>
                    <TableCell>{currency}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(report.cashCollectedMinor, currency, locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(report.billedMinor, currency, locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(report.receivableMinor, currency, locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(report.profitMinor, currency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <span className="text-muted-foreground">{t('finance.pointInTime')}:</span> {pointInTime}
          </p>
          <p>
            <span className="text-muted-foreground">{t('finance.currency')}:</span>{' '}
            {t('finance.currenciesSeparated')}
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

      <BankEvidenceReviewPanel
        rows={evidenceRows}
        reviewAction={reviewAdminBankEvidenceAction}
        openAction={openAdminBankEvidenceAction}
        labels={{
          title: t('finance.bankEvidence.title'),
          description: t('finance.bankEvidence.description'),
          empty: t('finance.bankEvidence.empty'),
          open: t('finance.bankEvidence.open'),
          clean: t('finance.bankEvidence.clean'),
          reject: t('finance.bankEvidence.reject'),
          rejectTitle: t('finance.bankEvidence.rejectTitle'),
          rejectDescription: t('finance.bankEvidence.rejectDescription'),
          rejectReason: t('finance.bankEvidence.rejectReason'),
          confirmReject: t('finance.bankEvidence.confirmReject'),
          cancel: t('finance.bankEvidence.cancel'),
          actionFailed: t('finance.bankEvidence.actionFailed'),
          states: Object.fromEntries(
            ['pending', 'clean', 'rejected', 'reconciled', 'expired', 'held', 'tombstoned'].map(
              (state) => [state, t(`finance.bankEvidence.states.${state}`)],
            ),
          ),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(subscriptions.currencies).flatMap(([currency, metric]) => [
          <Card key={`${currency}-mrr`} className="finance-kpi" data-kpi={`${currency}-mrr`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('finance.kpi.mrr')} · {currency}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">
                {formatMoney(metric.mrrMinor, currency, locale)}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('finance.kpi.exactRemainder', {
                  remainder: metric.mrrAnnualRemainderMinor,
                })}
              </p>
            </CardContent>
          </Card>,
          <Card key={`${currency}-arr`} className="finance-kpi" data-kpi={`${currency}-arr`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('finance.kpi.arr')} · {currency}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">
                {formatMoney(metric.arrNumeratorMinor, currency, locale)}
              </div>
            </CardContent>
          </Card>,
        ])}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('finance.tenantMrr')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table scrollAreaLabel={t('finance.tenantMrr')}>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">{t('finance.table.tenant')}</TableHead>
                <TableHead className="text-start">{t('finance.table.plan')}</TableHead>
                <TableHead className="text-start">{t('finance.table.status')}</TableHead>
                <TableHead className="text-start">{t('finance.table.periodEnd')}</TableHead>
                <TableHead className="text-end">{t('finance.table.mrr')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tenantId}>
                  <TableCell className="max-w-80 whitespace-normal">
                    <Link
                      className="inline-flex min-h-11 min-w-11 items-center rounded-sm break-words underline-offset-4 hover:underline"
                      href={`/admin/companies?tenant=${row.tenantId}`}
                    >
                      {row.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">
                    {t.has(`enums.plan.${row.plan}`)
                      ? t(`enums.plan.${row.plan}`)
                      : t('finance.valueUnavailable')}
                  </TableCell>
                  <TableCell>
                    {t.has(`finance.subStatus.${row.status}`)
                      ? t(`finance.subStatus.${row.status}`)
                      : t('finance.valueUnavailable')}
                  </TableCell>
                  <TableCell>
                    {row.currentPeriodEnd
                      ? date.format(new Date(row.currentPeriodEnd))
                      : t('finance.valueUnavailable')}
                  </TableCell>
                  <TableCell className="text-end">{row.mrr}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
