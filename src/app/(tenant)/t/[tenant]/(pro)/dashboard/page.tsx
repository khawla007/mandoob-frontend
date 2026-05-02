import { notFound } from 'next/navigation';

import { StatCard } from '@/components/admin/StatCard';
import { SignupsChart } from '@/components/admin/SignupsChart';
import { RecentLoginsTable } from '@/components/admin/RecentLoginsTable';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import {
  getProDashboardMetrics,
  getTenantRecentLogins,
  getTenantSignupSeries,
} from '@/lib/data/tenant-metrics';

export const dynamic = 'force-dynamic';

export default async function ProDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const [kpis, series, logins] = await Promise.all([
    getProDashboardMetrics(tenant.id),
    getTenantSignupSeries(tenant.id, 30),
    getTenantRecentLogins(tenant.id, 10),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {tenant.name} · workspace signals for your team.
          </p>
        </div>
        <div className="text-muted-foreground hidden text-xs md:block">Last 30 days · live</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <SignupsChart data={series} />

      <RecentLoginsTable
        rows={logins}
        title="Recent team activity"
        description={`Latest authentication events for ${tenant.name}.`}
      />
    </div>
  );
}
