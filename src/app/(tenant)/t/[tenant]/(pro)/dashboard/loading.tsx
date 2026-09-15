import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export default async function DashboardLoading() {
  const t = await getTranslations('pro.dashboard.signalStudio');
  return (
    <div className="signal-dashboard" aria-busy="true">
      <span role="status" className="sr-only">
        {t('loading')}
      </span>
      <div className="signal-dashboard__masthead">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-2 w-10" />
      </div>
      <div className="signal-dashboard__heading flex flex-col justify-between gap-4 md:flex-row">
        <div className="max-w-full space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-52 max-w-full" />
      </div>
      <div className="signal-dashboard__hero" aria-hidden="true">
        <div className="signal-hero relative isolate overflow-hidden text-white">
          <div className="signal-hero__content space-y-3">
            <Skeleton className="h-6 w-44 max-w-full bg-white/15" />
            <Skeleton className="h-8 w-72 max-w-full bg-white/15" />
            <Skeleton className="h-4 w-52 max-w-full bg-white/15" />
            <div className="signal-hero__facts">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 bg-white/15" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-32 bg-white/15" />
              <Skeleton className="h-11 w-32 bg-white/15" />
            </div>
          </div>
          <Skeleton className="signal-hero__chart bg-white/10" />
        </div>
      </div>
      <div className="signal-dashboard__kpis" aria-hidden="true">
        <div className="signal-kpis-grid grid gap-2 md:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="signal-kpi rounded-xl" />
          ))}
        </div>
      </div>
      <div className="signal-dashboard__layout">
        <div className="signal-dashboard__operations">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
        <div className="signal-dashboard__rail">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
