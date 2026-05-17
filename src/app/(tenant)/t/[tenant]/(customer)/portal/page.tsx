import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getProfileCard } from '@/lib/data/profile';
import { readSelfCustomer } from '@/lib/data/account-self';
import { listOpenRequestsForClient } from '@/lib/data/documents';
import { listRenewalsForClient } from '@/lib/data/renewals';
import { getRegistrationProgress } from '@/lib/mocks/customer-portal';
import { getInvoicesForCustomer } from '@/lib/data/payments';
import { getCommsForCustomer } from '@/lib/data/comms';
import { getConsentStateForPhone } from '@/lib/comms/consent';
import { optInSelfCommsAction } from '@/app/account/actions';
import type { Renewal } from '@/lib/types/renewals-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegistrationProgressCard } from '@/components/customer/RegistrationProgressCard';
import { ActiveDocRequestsCard } from '@/components/customer/ActiveDocRequestsCard';
import { UpcomingRenewalsCard } from '@/components/customer/UpcomingRenewalsCard';
import { RecentCommsCard } from '@/components/customer/RecentCommsCard';
import { PaymentHistoryCard } from '@/components/customer/PaymentHistoryCard';

export const dynamic = 'force-dynamic';

export default async function CustomerPortal({ params }: { params: Promise<{ tenant: string }> }) {
  const session = await requireRole('customer', 'super_admin');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const t = await getTranslations('customer');

  const customer = await readSelfCustomer().catch(() => ({ linkedClientId: null }));
  const linkedClientId = customer.linkedClientId;

  const [profile, progress, docs, renewalRows, comms, payments] = await Promise.all([
    getProfileCard(session.id),
    getRegistrationProgress(),
    linkedClientId ? listOpenRequestsForClient(tenant.id, linkedClientId) : Promise.resolve([]),
    linkedClientId ? listRenewalsForClient(tenant.id, linkedClientId) : Promise.resolve([]),
    getCommsForCustomer(session.id, { limit: 10 }),
    getInvoicesForCustomer(session.id),
  ]);
  const consentState = await getConsentStateForPhone(profile?.phone);
  const hasOptOut = consentState.whatsapp || consentState.sms;

  const renewals: Renewal[] = renewalRows
    .filter((r) => r.status === 'upcoming' || r.status === 'due_soon' || r.status === 'overdue')
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      dueDate: r.dueDate,
      daysOut: r.daysOut,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('welcome')}
          {profile?.fullName ? `, ${profile.fullName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('longCopy.welcomeIntro')}</p>
      </div>

      <RegistrationProgressCard data={progress} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveDocRequestsCard rows={docs} slug={tenant.slug} />
        <UpcomingRenewalsCard rows={renewals} slug={tenant.slug} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentCommsCard rows={comms} />
        <PaymentHistoryCard data={payments} tenantSlug={tenant.slug} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Communication preferences</CardTitle>
          <CardDescription>WhatsApp and SMS delivery for your profile phone.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">{profile?.phone ?? 'No phone on profile'}</span>
            <Badge variant={consentState.whatsapp ? 'destructive' : 'secondary'}>
              WhatsApp {consentState.whatsapp ? 'opted out' : 'active'}
            </Badge>
            <Badge variant={consentState.sms ? 'destructive' : 'secondary'}>
              SMS {consentState.sms ? 'opted out' : 'active'}
            </Badge>
          </div>
          {profile?.phone && hasOptOut && (
            <form
              action={async (formData) => {
                'use server';
                await optInSelfCommsAction(formData);
              }}
            >
              <input type="hidden" name="confirmation" value="OPT IN" />
              <input type="hidden" name="returnPath" value={`/t/${tenant.slug}/portal`} />
              <Button type="submit" variant="outline" size="sm">
                Opt back in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
