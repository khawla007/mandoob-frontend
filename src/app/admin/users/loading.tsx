import { Skeleton } from '@/components/ui/skeleton';
import { getTranslations } from 'next-intl/server';

export default async function UsersLoading() {
  const t = await getTranslations('admin.user.proRegistry');
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t('loading')}
    >
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-11 w-28" />
        </div>
        <div className="border-border space-y-6 rounded-xl border p-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div data-skeleton="toolbar" className="grid gap-3 lg:grid-cols-6">
            <Skeleton className="h-11 lg:col-span-2" />
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
            <div className="flex gap-2 lg:col-span-6">
              <Skeleton className="h-11 w-28" />
              <Skeleton className="h-11 w-24" />
            </div>
          </div>
          <div data-skeleton="applied-filters" className="flex flex-wrap gap-2">
            <Skeleton className="h-4 w-24 self-center" />
            <Skeleton className="h-11 w-32 rounded-full" />
            <Skeleton className="h-11 w-36 rounded-full" />
          </div>
          <div data-skeleton="table" className="overflow-x-auto rounded-lg border">
            <div className="min-w-[64rem]">
              <Skeleton className="h-11 w-full rounded-none" />
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="grid grid-cols-8 gap-4 border-t p-4">
                  {Array.from({ length: 8 }, (_, cell) => (
                    <Skeleton key={cell} className="h-5 min-w-12" />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div data-skeleton="pagination" className="flex items-center justify-between gap-4">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
