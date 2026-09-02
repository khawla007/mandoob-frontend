import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getBillingSubscriptionSnapshot } from '@/lib/data/tenant-billing';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { formatMoney } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  active: 'default',
  trialing: 'secondary',
  past_due: 'destructive',
  incomplete: 'secondary',
  canceled: 'outline',
  cancelled: 'outline',
} as const;

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const [t, locale, snapshot] = await Promise.all([
    getTranslations('pro.settings'),
    getLocale(),
    getBillingSubscriptionSnapshot(tenant.id),
  ]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="min-w-0">
        <p className="text-signal-accent-copy font-mono text-xs tracking-[0.14em] uppercase">
          {t('billing.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('billing.title')}
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('billing.description')}</p>
      </header>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="text-lg">{t('billing.currentSubscription')}</CardTitle>
          <CardDescription>{t('billing.readOnlyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.status === 'unavailable' ? (
            <p className="text-signal-urgent text-sm" role="status">
              {t('billing.providerUnavailable')}
            </p>
          ) : snapshot.data ? (
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('billing.plan')}</dt>
                <dd className="mt-1 font-medium">{snapshot.data.plan}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('billing.status')}</dt>
                <dd className="mt-1">
                  <Badge variant={STATUS_VARIANT[snapshot.data.status]}>
                    {t(`billing.statuses.${snapshot.data.status}`)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('billing.amount')}</dt>
                <dd className="mt-1 font-medium">
                  {formatMoney(snapshot.data.unitAmountMinor, snapshot.data.currency, locale)} /{' '}
                  {snapshot.data.interval}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('billing.periodEnd')}</dt>
                <dd className="mt-1 font-medium">
                  {snapshot.data.currentPeriodEnd
                    ? date.format(new Date(snapshot.data.currentPeriodEnd))
                    : t('billing.notAvailable')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('billing.cancellation')}</dt>
                <dd className="mt-1 font-medium">
                  {snapshot.data.cancelAtPeriodEnd
                    ? t('billing.cancelScheduled')
                    : snapshot.data.canceledAt
                      ? t('billing.cancelled')
                      : t('billing.notScheduled')}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm" role="status">
              {t('billing.noSubscription')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="signal-panel">
        <CardContent className="pt-6">
          <p id="billing-actions-unavailable" className="font-medium">
            {t('billing.planSelectionUnavailable')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2" aria-describedby="billing-actions-unavailable">
            <Button type="button" disabled>
              {t('billing.changePlan')}
            </Button>
            <Button type="button" variant="outline" disabled>
              {t('billing.manageBilling')}
            </Button>
            <Button type="button" variant="outline" disabled>
              {t('billing.cancelSubscription')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
