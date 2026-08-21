import { Skeleton } from '@/components/ui/skeleton';

export default function CompanyOnboardingLoading() {
  return (
    <section className="animate-pulse space-y-6" aria-busy="true">
      <header className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </header>
      <div className="grid min-w-0 gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="flex gap-2 overflow-hidden md:flex-col">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-11 min-w-40 rounded-xl md:min-w-0" />
          ))}
        </div>
        <div className="space-y-5 rounded-2xl border p-4 md:p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="ms-auto h-11 w-40" />
        </div>
      </div>
    </section>
  );
}
