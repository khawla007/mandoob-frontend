import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getProfileCard } from '@/lib/data/profile';
import { readSelfCustomer } from '@/lib/data/account-self';
import { listOpenRequestsForClient } from '@/lib/data/documents';
import { listRenewalsForClient } from '@/lib/data/renewals';
import { getPaymentHistory, getRegistrationProgress } from '@/lib/mocks/customer-portal';
import { getCommsForCustomer } from '@/lib/data/comms';
import type { Renewal } from '@/lib/types/renewals-ui';
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

  const customer = await readSelfCustomer().catch(() => ({ linkedClientId: null }));
  const linkedClientId = customer.linkedClientId;

  const [profile, progress, docs, renewalRows, comms, payments] = await Promise.all([
    getProfileCard(session.id),
    getRegistrationProgress(),
    linkedClientId ? listOpenRequestsForClient(tenant.id, linkedClientId) : Promise.resolve([]),
    linkedClientId ? listRenewalsForClient(tenant.id, linkedClientId) : Promise.resolve([]),
    getCommsForCustomer(session.id, { limit: 10 }),
    getPaymentHistory(),
  ]);

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
          Welcome{profile?.fullName ? `, ${profile.fullName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your registration, documents, renewals, and invoices at a glance.
        </p>
      </div>

      <RegistrationProgressCard data={progress} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveDocRequestsCard rows={docs} slug={tenant.slug} />
        <UpcomingRenewalsCard rows={renewals} slug={tenant.slug} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentCommsCard rows={comms} />
        <PaymentHistoryCard data={payments} />
      </div>
    </div>
  );
}
