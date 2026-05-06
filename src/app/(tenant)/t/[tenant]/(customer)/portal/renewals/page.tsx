import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { readSelfCustomer } from '@/lib/data/account-self';
import { listRenewalsForClient } from '@/lib/data/renewals';
import { RenewalsTimeline } from '@/components/customer/RenewalsTimeline';
import type { PastRenewal, Renewal } from '@/lib/types/renewals-ui';

export const dynamic = 'force-dynamic';

export default async function RenewalsPage({ params }: { params: Promise<{ tenant: string }> }) {
  await requireRole('customer', 'super_admin');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const customer = await readSelfCustomer().catch(() => ({ linkedClientId: null }));
  const linkedClientId = customer.linkedClientId;

  if (!linkedClientId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renewals</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Trade license, visas, Emirates IDs, and Ejari renewals — past and upcoming.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account not linked</CardTitle>
            <CardDescription>
              Your account is not linked to a client file yet. Ask your PRO firm to link you, then{' '}
              <Link
                href={`/t/${tenant.slug}/account`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                review your account details
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const rows = await listRenewalsForClient(tenant.id, linkedClientId);

  const upcoming: Renewal[] = rows
    .filter((r) => r.status === 'upcoming' || r.status === 'due_soon' || r.status === 'overdue')
    .map((r) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      dueDate: r.dueDate,
      daysOut: r.daysOut,
    }));

  const past: PastRenewal[] = rows
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      completedAt: r.completedAt ?? '',
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Renewals</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Trade license, visas, Emirates IDs, and Ejari renewals — past and upcoming.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
          <CardDescription>
            Color cues: red = within 30 days · amber = within 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenewalsTimeline upcoming={upcoming} past={past} />
        </CardContent>
      </Card>
    </div>
  );
}
