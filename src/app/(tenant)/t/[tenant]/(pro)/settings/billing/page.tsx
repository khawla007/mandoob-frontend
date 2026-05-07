import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/money';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  cancelSubscriptionAction,
  openBillingPortalAction,
  startCheckoutAction,
} from './actions';

export const dynamic = 'force-dynamic';

const plans = [
  { id: 'starter', label: 'Starter', amount: 4900, features: ['Client workspace', 'Email queue', 'Renewal alerts'] },
  { id: 'professional', label: 'Professional', amount: 9900, features: ['Payments', 'WhatsApp + SMS', 'Audit exports'] },
  { id: 'enterprise', label: 'Enterprise', amount: 19900, features: ['Priority support', 'Advanced controls', 'Scale limits'] },
] as const;

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const admin = createSupabaseServiceRoleClient();
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end, unit_amount_minor, currency, interval')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium capitalize">{subscription?.plan ?? tenant.plan}</span>
              <Badge variant="outline">{subscription?.status ?? 'not subscribed'}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {subscription
                ? `${formatMoney(subscription.unit_amount_minor, subscription.currency)} / ${subscription.interval}`
                : 'Choose a plan to activate Stripe subscription billing.'}
            </p>
            {subscription?.current_period_end ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Current period ends {new Date(subscription.current_period_end).toLocaleDateString('en-GB')}
              </p>
            ) : null}
          </div>
          {subscription ? (
            <div className="flex gap-2">
              <form action={openBillingPortalAction}>
                <input type="hidden" name="tenantSlug" value={slug} />
                <Button type="submit">Manage billing</Button>
              </form>
              {!subscription.cancel_at_period_end ? (
                <form action={cancelSubscriptionAction}>
                  <input type="hidden" name="tenantSlug" value={slug} />
                  <Button type="submit" variant="outline">
                    Cancel
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-semibold">{formatMoney(plan.amount, 'USD')}</div>
              <ul className="text-muted-foreground space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <form action={startCheckoutAction}>
                <input type="hidden" name="tenantSlug" value={slug} />
                <input type="hidden" name="plan" value={plan.id} />
                <Button className="w-full" type="submit">
                  {subscription ? 'Change plan' : 'Subscribe'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

