import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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

  const t = await getTranslations('pro');
  const tKpis = await getTranslations('pro.dashboard.kpis');

  const [kpis, series, logins] = await Promise.all([
    getProDashboardMetrics(tenant.id),
    getTenantSignupSeries(tenant.id, 30),
    getTenantRecentLogins(tenant.id, 10),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('overview')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('dashboard.subtitle', { tenant: tenant.name })}
          </p>
        </div>
        <div className="text-muted-foreground hidden text-xs md:block">{t('lastThirtyDays')}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.key}
            label={tKpis(`${k.key}.label`)}
            value={k.value}
            delta={k.delta}
            deltaLabel={tKpis(`${k.key}.delta`)}
          />
        ))}
      </div>

      <SignupsChart data={series} />

      <RecentLoginsTable
        rows={logins}
        title={t('recentTeamActivity')}
        description={t('dashboard.recentActivityDescription', { tenant: tenant.name })}
      />
    </div>
  );
}
