import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="signal-dashboard space-y-4" aria-busy="true">
      <div className="signal-dashboard__masthead">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-2 w-10" />
      </div>
      <div className="signal-dashboard__heading flex flex-col justify-between gap-4 sm:flex-row">
        <div className="max-w-full space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-52 max-w-full" />
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-56 rounded-2xl" />
      <div className="signal-dashboard__kpis grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
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
