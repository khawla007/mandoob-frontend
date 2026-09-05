import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  customerFinanceHref,
  customerInvoiceDueState,
  parseCustomerFinanceSearch,
  totalsByCurrency,
  type CustomerFinanceFilter,
} from '@/lib/customer/customer-finance';
import { signalBusinessDate } from '@/lib/data/signal-finance';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { listCustomerFinance } from '@/lib/data/customer-finance-workspace';
import { formatMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

export default async function CustomerPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenant: slug }, raw, t, locale] = await Promise.all([
    params,
    searchParams,
    getTranslations('customer.financeWorkspace'),
    getLocale(),
  ]);
  const search = parseCustomerFinanceSearch(raw);
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const workspace = await listCustomerFinance(slug, search, { authorize: async () => access });
  if (!search.invoice && workspace.canonicalPage !== workspace.page)
    redirect(customerFinanceHref(slug, { ...search, page: workspace.canonicalPage }));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  const number = new Intl.NumberFormat(locale);
  const today = signalBusinessDate();
  const totals = totalsByCurrency(workspace.rows);
  const stateCopy =
    workspace.state === 'empty'
      ? (['empty', 'emptyDescription'] as const)
      : workspace.state === 'no-results'
        ? (['noResults', 'noResultsDescription'] as const)
        : workspace.state === 'error'
          ? (['error', 'errorDescription'] as const)
          : workspace.state === 'partial'
            ? (['partial', 'partialDescription'] as const)
            : workspace.state === 'unlinked'
              ? (['unlinked', 'unlinkedDescription'] as const)
              : workspace.state === 'permission'
                ? (['permission', 'permissionDescription'] as const)
                : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{t('description')}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('summaryLabel')}>
        <Summary
          label={t('total')}
          value={
            workspace.unfilteredTotal === null
              ? t('unavailable')
              : number.format(workspace.unfilteredTotal)
          }
        />
        <Summary
          label={t('filtered')}
          value={workspace.total === null ? t('unavailable') : number.format(workspace.total)}
        />
        <Summary label={t('provider')} value={t(`providerStates.${workspace.provider}`)} />
      </section>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('workspace')}</CardTitle>
          <CardDescription>{t('workspaceDescription')}</CardDescription>
          <nav className="flex flex-wrap gap-2 pt-3" aria-label={t('filters')}>
            {(['all', 'open', 'overdue', 'paid', 'cancelled'] as CustomerFinanceFilter[]).map(
              (status) => (
                <Button
                  key={status}
                  variant={search.status === status ? 'default' : 'outline'}
                  size="sm"
                  asChild
                >
                  <Link href={customerFinanceHref(slug, { status, page: 1, invoice: null })}>
                    {t(`statuses.${status}`)}
                  </Link>
                </Button>
              ),
            )}
          </nav>
        </CardHeader>
        <CardContent className="space-y-4">
          {totals === null ? (
            <p role="status" className="text-muted-foreground text-sm">
              {t('balancesUnavailable')}
            </p>
          ) : totals.length ? (
            <div className="flex flex-wrap gap-2" aria-label={t('visibleOpenBalances')}>
              {totals.map((total) => (
                <Badge key={total.currency} variant="secondary">
                  {formatMoney(total.amountMinor, total.currency, locale)}
                </Badge>
              ))}
              <span className="text-muted-foreground text-xs">{t('boundedBalances')}</span>
            </div>
          ) : null}
          {stateCopy ? <State title={t(stateCopy[0])} description={t(stateCopy[1])} /> : null}
          {workspace.rows.length ? (
            <div className="overflow-x-auto rounded-lg border" role="region" aria-label={t('list')}>
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('invoice')}</th>
                    <th className="px-3 py-2 text-start">{t('amount')}</th>
                    <th className="px-3 py-2 text-start">{t('due')}</th>
                    <th className="px-3 py-2 text-start">{t('status')}</th>
                    <th className="px-3 py-2 text-start">{t('paymentState')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {workspace.rows.map((invoice) => {
                    const dueState = customerInvoiceDueState(invoice.status, invoice.dueAt, today);
                    return (
                      <tr key={invoice.id}>
                        <td className="px-3 py-3">
                          <Link
                            className="font-medium underline-offset-4 hover:underline focus-visible:ring-2"
                            href={`/t/${encodeURIComponent(slug)}/portal/payments/${encodeURIComponent(invoice.id)}`}
                          >
                            {invoice.label}
                          </Link>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {formatMoney(invoice.amountMinor, invoice.currency, locale)}
                        </td>
                        <td className="px-3 py-3">
                          {invoice.dueAt
                            ? date.format(new Date(`${invoice.dueAt}T00:00:00Z`))
                            : t('dateUnavailable')}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={dueState === 'overdue' ? 'destructive' : 'secondary'}>
                            {t(
                              `invoiceStates.${dueState === 'settled' ? invoice.status : dueState}`,
                            )}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          {invoice.latestPayment
                            ? t(`paymentStates.${invoice.latestPayment.status}`)
                            : t('noAttempt')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {workspace.total !== null && workspace.total > workspace.pageSize ? (
            <Pagination
              slug={slug}
              search={search}
              page={workspace.page}
              total={workspace.total}
              pageSize={workspace.pageSize}
              t={t}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-panel rounded-lg border p-4">
      <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function State({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}
type FinanceT = Awaited<ReturnType<typeof getTranslations<'customer.financeWorkspace'>>>;
function Pagination({
  slug,
  search,
  page,
  total,
  pageSize,
  t,
}: {
  slug: string;
  search: ReturnType<typeof parseCustomerFinanceSearch>;
  page: number;
  total: number;
  pageSize: number;
  t: FinanceT;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">
        {t('page', { current: page, total: pages })}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" asChild>
            <Link href={customerFinanceHref(slug, { ...search, invoice: null, page: page - 1 })}>
              {t('previous')}
            </Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button variant="outline" asChild>
            <Link href={customerFinanceHref(slug, { ...search, invoice: null, page: page + 1 })}>
              {t('next')}
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
