import Link from 'next/link';

import { documentCenterHref } from '@/app/(tenant)/t/[tenant]/(pro)/documents/page-logic';
import type { DocumentCenterSearch } from '@/lib/validation/pro-document-center';

export type DocumentQueuePaginationLabels = {
  result: string;
  pageCount: string;
  pagination: string;
  previous: string;
  next: string;
};

export function DocumentQueuePagination({
  slug,
  query,
  page,
  totalPages,
  labels,
}: {
  slug: string;
  query: DocumentCenterSearch;
  page: number;
  totalPages: number;
  labels: DocumentQueuePaginationLabels;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm tabular-nums">{labels.result}</p>
      <nav aria-label={labels.pagination} className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={documentCenterHref(slug, query, page - 1)}
            aria-label={labels.previous}
            className="border-input bg-background hover:bg-muted focus-visible:ring-ring inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {labels.previous}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 text-sm">
            {labels.previous}
          </span>
        )}
        <span className="text-sm tabular-nums" aria-current="page">
          {labels.pageCount}
        </span>
        {page < totalPages ? (
          <Link
            href={documentCenterHref(slug, query, page + 1)}
            aria-label={labels.next}
            className="border-input bg-background hover:bg-muted focus-visible:ring-ring inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {labels.next}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 text-sm">
            {labels.next}
          </span>
        )}
      </nav>
    </div>
  );
}
