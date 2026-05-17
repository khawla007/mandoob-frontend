import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PaymentHistory } from '@/lib/data/payments';
import { PayButton } from '@/components/customer/PayButton';

export async function PaymentHistoryCard({
  data,
  tenantSlug,
}: {
  data: PaymentHistory;
  tenantSlug: string;
}) {
  const t = await getTranslations('customer');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payments')}</CardTitle>
        <CardDescription>{t('longCopy.paymentsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {t('pending')}
          </h3>
          {data.pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noPendingInvoices')}</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {data.pending.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-4 py-2 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {p.dueDate ? `${t('due')} ${p.dueDate}` : t('noDueDate')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">{p.amount}</div>
                    <PayButton invoiceId={p.id} tenantSlug={tenantSlug} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {t('recent')}
          </h3>
          {data.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noRecentPayments')}</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {data.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-4 py-2 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{h.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {t('paid')} {h.paidAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground text-sm">{h.amount}</div>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/t/${tenantSlug}/portal/payments/${h.id}/receipt`}
                        target="_blank"
                      >
                        {t('receipt')}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
