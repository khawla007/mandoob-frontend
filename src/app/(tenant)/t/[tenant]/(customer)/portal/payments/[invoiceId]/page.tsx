import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { customerInvoiceDueState } from '@/lib/customer/customer-finance';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { loadCustomerInvoiceDetail } from '@/lib/data/customer-finance-workspace';
import { signalBusinessDate } from '@/lib/data/signal-finance';
import { formatMoney } from '@/lib/format/money';
import { isReceiptEligible } from '@/lib/pdf/receipt';

export const dynamic = 'force-dynamic';

export default async function CustomerInvoicePage({
  params,
}: {
  params: Promise<{ tenant: string; invoiceId: string }>;
}) {
  const [{ tenant: slug, invoiceId }, t, locale] = await Promise.all([
    params,
    getTranslations('customer.financeWorkspace'),
    getLocale(),
  ]);
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const detail = await loadCustomerInvoiceDetail(slug, invoiceId, {
    authorize: async () => access,
  });
  if (detail.state === 'not-found') notFound();
  if (detail.state === 'error') throw new Error('CUSTOMER_FINANCE_UNAVAILABLE');
  if (detail.state !== 'ready') {
    const unlinked = detail.state === 'unlinked';
    return (
      <StatePage
        title={t(unlinked ? 'unlinked' : 'permission')}
        description={t(unlinked ? 'unlinkedDescription' : 'permissionDescription')}
      />
    );
  }
  const { invoice } = detail;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  const dueState = customerInvoiceDueState(invoice.status, invoice.dueAt, signalBusinessDate());
  const base = `/t/${encodeURIComponent(slug)}/portal/payments`;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
          {t('detail.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{invoice.label}</h1>
        <Link
          className="text-muted-foreground mt-2 inline-block text-sm underline-offset-4 hover:underline focus-visible:ring-2"
          href={base}
        >
          {t('detail.back')}
        </Link>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('detail.summary')}</CardTitle>
              <CardDescription>
                {formatMoney(invoice.amountMinor, invoice.currency, locale)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Fact
                label={t('amount')}
                value={formatMoney(invoice.amountMinor, invoice.currency, locale)}
              />
              <Fact
                label={t('due')}
                value={
                  invoice.dueAt
                    ? date.format(new Date(`${invoice.dueAt}T00:00:00Z`))
                    : t('dateUnavailable')
                }
              />
              <div>
                <p className="text-muted-foreground text-xs">{t('status')}</p>
                <Badge variant={dueState === 'overdue' ? 'destructive' : 'secondary'}>
                  {t(`invoiceStates.${dueState === 'settled' ? invoice.status : dueState}`)}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('detail.payments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.payments === null ? (
                <p className="text-muted-foreground text-sm">{t('detail.historyUnavailable')}</p>
              ) : detail.payments.length ? (
                <ul className="divide-y">
                  {detail.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <span>{t(`paymentStates.${payment.status}`)}</span>
                      <span className="tabular-nums">
                        {formatMoney(payment.amountMinor, payment.currency, locale)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {payment.receivedAt
                          ? date.format(new Date(payment.receivedAt))
                          : date.format(new Date(payment.createdAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t('detail.historyEmpty')}</p>
              )}
            </CardContent>
          </Card>
          <Card className="signal-panel">
            <CardHeader>
              <CardTitle>{t('detail.refunds')}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.refunds === null ? (
                <p className="text-muted-foreground text-sm">{t('detail.historyUnavailable')}</p>
              ) : detail.refunds.length ? (
                <ul className="divide-y">
                  {detail.refunds.map((refund) => (
                    <li key={refund.id} className="flex items-center justify-between gap-2 py-3">
                      <span>{t(`paymentStates.${refund.status}`)}</span>
                      <span className="tabular-nums">
                        {formatMoney(refund.amountMinor, invoice.currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t('detail.refundsEmpty')}</p>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4">
          <div className="signal-panel rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">
              {invoice.status !== 'open'
                ? t('detail.invoiceNotPayable')
                : detail.provider === 'error'
                  ? t('detail.providerStateUnavailable')
                  : detail.provider === 'unavailable'
                    ? t('detail.providerUnavailable')
                    : t('detail.paymentContractUnavailable')}
            </p>
            {isReceiptEligible(invoice.status) ? (
              <Button variant="outline" className="mt-3 w-full" asChild>
                <a href={`${base}/${encodeURIComponent(invoice.id)}/receipt`}>
                  {t('detail.receipt')}
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            {t('detail.lineItemsUnavailable')}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
function StatePage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{description}</p>
    </div>
  );
}
