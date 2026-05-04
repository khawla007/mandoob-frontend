import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getPastRenewals, getUpcomingRenewals } from '@/lib/mocks/customer-portal';
import { RenewalsTimeline } from '@/components/customer/RenewalsTimeline';

export const dynamic = 'force-dynamic';

export default async function RenewalsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [upcoming, past] = await Promise.all([getUpcomingRenewals(), getPastRenewals()]);

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
