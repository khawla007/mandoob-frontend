import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerPaymentsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
