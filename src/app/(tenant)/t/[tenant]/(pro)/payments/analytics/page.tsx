import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
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
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { formatMoney as formatMinorMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type KpiKey =
  | 'collectedRevenue'
  | 'outstandingReceivables'
  | 'openInvoices'
  | 'overdueInvoices'
  | 'collectionRate';

const kpiCards: Array<{ key: KpiKey; labelKey: string }> = [
  { key: 'collectedRevenue', labelKey: 'paymentCollectedRevenue' },
  { key: 'outstandingReceivables', labelKey: 'paymentOutstandingReceivables' },
  { key: 'openInvoices', labelKey: 'paymentOpenInvoices' },
  { key: 'overdueInvoices', labelKey: 'paymentOverdueInvoices' },
  { key: 'collectionRate', labelKey: 'paymentCollectionRate' },
];

export default async function ProPaymentAnalyticsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const [dashboard, t, locale] = await Promise.all([
    getProFinanceDashboard(tenant.id, company.id),
    getTranslations('pro'),
    getLocale(),
  ]);
  const failedAttempts = dashboard.recentFailedAttempts;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/t/${tenant.slug}/payments`}>
          <ChevronLeft className="size-4" />
          {t('paymentBack')}
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('paymentAnalyticsTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('paymentAnalyticsSubtitle')}</p>
        </div>
        <Button asChild>
          <Link href={`/t/${tenant.slug}/payments`}>{t('payments')}</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((kpi) => (
          <Card key={kpi.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t(kpi.labelKey)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold">
                {readKpi(dashboard, kpi.key, locale)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dashboard.hasMixedCurrencies ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('paymentMixedCurrencyNotice', {
            currencies: dashboard.excludedCurrencyCodes.join(', '),
          })}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentInvoiceStatus')}</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.invoiceStatus.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentAnalyticsEmpty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentStatus')}</TableHead>
                  <TableHead className="text-right">{t('paymentCount')}</TableHead>
                  <TableHead className="text-right">{t('paymentAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.invoiceStatus.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.key}</TableCell>
                    <TableCell className="text-right">{formatCount(row.count, locale)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.amountMinor, row.currency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentMethods')}</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.paymentMethods.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentAnalyticsEmpty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentMethod')}</TableHead>
                  <TableHead className="text-right">{t('paymentCount')}</TableHead>
                  <TableHead className="text-right">{t('paymentAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.paymentMethods.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.key}</TableCell>
                    <TableCell className="text-right">{formatCount(row.count, locale)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.amountMinor, row.currency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentAttempts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {failedAttempts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentAttemptsEmpty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentInvoice')}</TableHead>
                  <TableHead>{t('paymentStatus')}</TableHead>
                  <TableHead>{t('paymentAttempted')}</TableHead>
                  <TableHead className="text-right">{t('paymentAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedAttempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-mono">{attempt.invoiceId.slice(0, 8)}</TableCell>
                    <TableCell>{attempt.status}</TableCell>
                    <TableCell>{formatDate(attempt.createdAt, locale)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(attempt.amountMinor, attempt.currency, locale)}
                    </TableCell>
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

function readKpi(dashboard: ProFinanceDashboard, key: KpiKey, locale: string) {
  if (key === 'collectedRevenue')
    return formatMoney(dashboard.totalRevenueCollectedMinor, dashboard.currency, locale);
  if (key === 'outstandingReceivables')
    return formatMoney(dashboard.outstandingReceivablesMinor, dashboard.currency, locale);
  if (key === 'openInvoices') return String(dashboard.openInvoiceCount ?? 0);
  if (key === 'overdueInvoices') return String(dashboard.overdueInvoiceCount ?? 0);

  return dashboard.collectionRateDisplay;
}

function formatMoney(amountMinor: number, currency: string, locale: string) {
  return formatMinorMoney(amountMinor, currency, locale);
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}
function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}
