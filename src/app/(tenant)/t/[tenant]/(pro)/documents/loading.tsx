import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';

export default function DocumentCenterLoading() {
  const t = useTranslations('proDocumentCenter');

  return (
    <div className="document-center document-center--loading grid min-w-0 gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t('loading.label')}
      </p>

      <header
        className="document-center__heading flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        aria-hidden="true"
      >
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-40 max-w-full" />
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-[32rem] max-w-full" />
        </div>
        <Skeleton className="h-11 w-48 max-w-full rounded-lg" />
      </header>

      <section
        className="document-center__summary-grid grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="document-center__skeleton-summary">
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36 max-w-full" />
            </div>
            <Skeleton className="size-9 rounded-lg" />
          </div>
        ))}
      </section>

      <section
        className="signal-panel document-center__workspace grid min-w-0 gap-5 rounded-2xl border p-4 sm:p-5"
        aria-hidden="true"
      >
        <div className="document-center__skeleton-filter">
          <Skeleton className="h-9 min-w-0 flex-1" />
          <Skeleton className="h-9 w-44 max-w-full" />
          <Skeleton className="h-9 w-32 max-w-full" />
        </div>
        <div className="document-center__skeleton-table">
          <div className="document-center__skeleton-table-head">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
          {Array.from({ length: 5 }, (_, row) => (
            <div key={row} className="document-center__skeleton-table-row">
              {Array.from({ length: 6 }, (_, column) => (
                <Skeleton key={column} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
