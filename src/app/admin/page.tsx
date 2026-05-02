import { StatCard } from '@/components/admin/StatCard';
import { SignupsChart } from '@/components/admin/SignupsChart';
import { RecentLoginsTable } from '@/components/admin/RecentLoginsTable';
import { getAdminKpis, getRecentLogins, getSignupSeries } from '@/lib/data/admin-metrics';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const [kpis, series, logins] = await Promise.all([
    getAdminKpis(),
    getSignupSeries(30),
    getRecentLogins(10),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cross-tenant authentication and identity signals.
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

      <RecentLoginsTable rows={logins} />
    </div>
  );
}
