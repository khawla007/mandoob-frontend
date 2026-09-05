import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewInvoiceDialog } from '@/components/pro/NewInvoiceDialog';
import { InvoicesTable } from '@/components/pro/InvoicesTable';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { listInvoicesForPaymentView } from '@/lib/data/invoices';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  parsePaymentSearch,
  parsePaymentPage,
  paymentPageHref,
  paymentViewHref,
  type PaymentView,
} from './page-logic';

export const dynamic = 'force-dynamic';

const PAYMENT_VIEWS: Array<{ value: PaymentView; labelKey: string }> = [
  { value: 'all', labelKey: 'paymentViewAll' },
  { value: 'billed', labelKey: 'paymentViewBilled' },
  { value: 'paid', labelKey: 'paymentViewPaid' },
  { value: 'due-soon', labelKey: 'paymentViewDueSoon' },
  { value: 'overdue', labelKey: 'paymentViewOverdue' },
];

export default async function ProPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    view?: string | string[];
    page?: string | string[];
    date?: string | string[];
    period?: string | string[];
    eventTypes?: string | string[];
  }>;
}) {
  const { tenant: slug } = await params;
  const search = await searchParams;
  const { view, date, period } = parsePaymentSearch(search);
  const page = parsePaymentPage(search.page);
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();
  const [t, locale] = await Promise.all([getTranslations('pro'), getLocale()]);

  const invoicePage = await listInvoicesForPaymentView(tenant.id, company.id, {
    view,
    page,
    date,
    period,
  });
  const activeView =
    view === 'due-date'
      ? { value: view, labelKey: 'paymentViewDueDate' }
      : PAYMENT_VIEWS.find((item) => item.value === view)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('payments')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('paymentsPageSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button asChild variant="outline">
            <Link href={`/t/${tenant.slug}/payments/analytics`}>{t('paymentAnalytics')}</Link>
          </Button>
          <NewInvoiceDialog slug={tenant.slug} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('paymentInvoicesTitle', { view: t(activeView.labelKey) })}
          </CardTitle>
          <nav aria-label={t('paymentFilterLabel')} className="flex flex-wrap gap-2 pt-2">
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
                  {t(item.labelKey)}
                </Link>
              </Button>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <InvoicesTable
            slug={tenant.slug}
            rows={invoicePage.rows}
            emptyMessage={t('paymentEmpty', { view: t(activeView.labelKey) })}
          />
          {invoicePage.total > invoicePage.pageSize ? (
            <nav
              aria-label={t('paymentPagesLabel')}
              className="mt-4 flex items-center justify-between text-sm"
            >
              {invoicePage.page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={paymentPageHref(
                      tenant.slug,
                      { view, date, period },
                      invoicePage.page - 1,
                    )}
                  >
                    {t('paymentPrevious')}
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  {t('paymentPrevious')}
                </Button>
              )}
              <span>
                {t('paymentPageSummary', {
                  page: new Intl.NumberFormat(locale).format(invoicePage.page),
                  pages: new Intl.NumberFormat(locale).format(
                    Math.ceil(invoicePage.total / invoicePage.pageSize),
                  ),
                })}
              </span>
              {invoicePage.page * invoicePage.pageSize < invoicePage.total ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={paymentPageHref(
                      tenant.slug,
                      { view, date, period },
                      invoicePage.page + 1,
                    )}
                  >
                    {t('paymentNext')}
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  {t('paymentNext')}
                </Button>
              )}
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
