import { Skeleton } from '@/components/ui/skeleton';

export function AdminCommandDashboardLoading({ label }: { label: string }) {
  return (
    <section className="admin-signal-dashboard" role="status" aria-busy="true" aria-label={label}>
      <div aria-hidden="true">
        <div className="admin-signal-dashboard__heading space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-96 max-w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="admin-platform-signal p-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-36 bg-white/15" />
            <Skeleton className="h-9 w-3/4 bg-white/15" />
            <Skeleton className="h-20 w-full bg-white/15" />
          </div>
        </div>
        <div className="admin-signal-dashboard__primary-kpis">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
        <div className="admin-signal-dashboard__secondary-kpis">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="admin-signal-dashboard__operations">
          <div className="admin-signal-dashboard__main">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <div className="admin-signal-dashboard__rail">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
