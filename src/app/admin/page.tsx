import { getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/admin/StatCard';
import { SignupsChart } from '@/components/admin/SignupsChart';
import { RecentLoginsTable } from '@/components/admin/RecentLoginsTable';
import { getAdminKpis, getRecentLogins, getSignupSeries } from '@/lib/data/admin-metrics';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  const [kpis, series, logins] = await Promise.all([
    getAdminKpis(),
    getSignupSeries(30),
    getRecentLogins(10),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('dashboard.intro')}</p>
        </div>
        <div className="text-muted-foreground hidden text-xs md:block">
          {t('dashboard.lastDaysLive')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.labelKey}
            label={t(`stats.${k.labelKey}`)}
            value={k.value}
            delta={k.delta}
            deltaLabel={t(`stats.${k.deltaLabelKey}`)}
          />
        ))}
      </div>

      <SignupsChart data={series} />

      <RecentLoginsTable rows={logins} />
    </div>
  );
}
