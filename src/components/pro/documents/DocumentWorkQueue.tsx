import Link from 'next/link';
import { Ban, CheckCircle2, CircleAlert, Clock3, FileClock, ScanLine } from 'lucide-react';

import type { DocumentCenterRow } from '@/lib/data/pro-document-center';
import type { DocumentCenterSearch } from '@/lib/validation/pro-document-center';
import type { DocType } from '@/lib/validation/document';
import {
  DocumentActions,
  type DocumentActionLabels,
} from '@/components/pro/documents/DocumentActions';
import {
  DocumentQueuePagination,
  type DocumentQueuePaginationLabels,
} from './DocumentQueuePagination';

type RequestStatus = NonNullable<DocumentCenterRow['requestStatus']>;
type ReviewStatus = NonNullable<DocumentCenterRow['reviewStatus']>;

export type DocumentQueueLabels = {
  region: string;
  documentType: string;
  requestStatus: string;
  reviewStatus: string;
  due: string;
  expiry: string;
  upload: string;
  file: string;
  actors: string;
  action: string;
  employee: string;
  requester: string;
  reviewer: string;
  unavailable: string;
  unknownActor: string;
  dubaiTime: string;
  emptyFirmTitle: string;
  emptyFirmDescription: string;
  emptyFilteredTitle: string;
  emptyFilteredDescription: string;
  reset: string;
  result: string;
  pageCount: string;
  requestStatuses: Record<RequestStatus, string>;
  reviewStatuses: Record<ReviewStatus, string>;
  docTypes: Record<DocType, string>;
  units: { bytes: string; kb: string; mb: string; gb: string };
} & Pick<DocumentQueuePaginationLabels, 'pagination' | 'previous' | 'next'>;

function formatDate(
  value: string | null,
  formatter: Intl.DateTimeFormat,
  unavailable: string,
): string {
  if (!value) return unavailable;
  const timestamp = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00.000Z` : value;
  return formatter.format(new Date(timestamp));
}

function formatTimestamp(
  value: string | null,
  formatter: Intl.DateTimeFormat,
  unavailable: string,
  dubaiTime: string,
): string {
  if (!value) return unavailable;
  const formatted = formatter.format(new Date(value));
  return `${formatted} ${dubaiTime}`;
}

function formatSize(
  bytes: number | null,
  integerFormatter: Intl.NumberFormat,
  decimalFormatter: Intl.NumberFormat,
  units: DocumentQueueLabels['units'],
  unavailable: string,
): string {
  if (bytes === null) return unavailable;
  const levels = [units.bytes, units.kb, units.mb, units.gb];
  let value = bytes;
  let level = 0;
  while (value >= 1024 && level < levels.length - 1) {
    value /= 1024;
    level += 1;
  }
  return `${(level === 0 ? integerFormatter : decimalFormatter).format(value)} ${levels[level]}`;
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === 'approved' || status === 'fulfilled') {
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />;
  }
  if (status === 'rejected') {
    return <CircleAlert aria-hidden="true" className="size-3.5" />;
  }
  if (status === 'cancelled') return <Ban aria-hidden="true" className="size-3.5" />;
  if (status === 'pending') return <Clock3 aria-hidden="true" className="size-3.5" />;
  return <ScanLine aria-hidden="true" className="size-3.5" />;
}

function Status({ value, label }: { value: string | null; label: string }) {
  return (
    <span
      className={`document-center__status document-center__status--${value ?? 'unknown'} inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium`}
    >
      <StatusIcon status={value} />
      {label}
    </span>
  );
}

export function DocumentWorkQueue({
  rows,
  page,
  totalPages,
  slug,
  query,
  locale,
  labels,
  actionLabels,
  resetHref,
}: {
  rows: DocumentCenterRow[];
  page: number;
  totalPages: number;
  slug: string;
  query: DocumentCenterSearch;
  locale: string;
  labels: DocumentQueueLabels;
  actionLabels: DocumentActionLabels;
  resetHref: string;
}) {
  const hasActiveFilters =
    query.view !== 'all' ||
    query.sort !== 'urgency' ||
    query.window !== 'all' ||
    Boolean(query.docType || query.search || query.from || query.to || query.focus);

  if (rows.length === 0) {
    return (
      <div className="document-center__empty grid justify-items-center gap-3 rounded-xl border border-dashed px-5 py-12 text-center">
        <FileClock aria-hidden="true" className="text-muted-foreground size-7" />
        <div className="max-w-lg">
          <p className="font-semibold">
            {hasActiveFilters ? labels.emptyFilteredTitle : labels.emptyFirmTitle}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {hasActiveFilters ? labels.emptyFilteredDescription : labels.emptyFirmDescription}
          </p>
        </div>
        {hasActiveFilters ? (
          <Link
            href={resetHref}
            className="border-input bg-background hover:bg-muted focus-visible:ring-ring inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {labels.reset}
          </Link>
        ) : (
          <DocumentActions kind="request" slug={slug} labels={actionLabels} />
        )}
      </div>
    );
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  });
  const timestampFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  const integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimalFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  return (
    <div className="document-center__queue grid min-w-0 gap-4">
      <div
        role="region"
        aria-label={labels.region}
        tabIndex={0}
        className="document-center__queue-scroll focus-visible:ring-ring max-w-full overflow-x-auto rounded-xl border focus-visible:ring-2 focus-visible:outline-none"
      >
        <table className="w-full min-w-[74rem] text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {[
                labels.documentType,
                labels.requestStatus,
                labels.reviewStatus,
                labels.due,
                labels.expiry,
                labels.upload,
                labels.file,
                labels.actors,
                labels.action,
              ].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2.5 text-start font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const focused =
                query.focus?.kind === row.entityKind && query.focus.id === row.entityId;
              return (
                <tr
                  key={`${row.entityKind}:${row.entityId}`}
                  id={`document-center-row-${row.entityKind}-${row.entityId}`}
                  aria-current={focused ? 'true' : undefined}
                  className="aria-current:bg-primary/5 hover:bg-muted/20 align-top transition-colors"
                >
                  <td className="max-w-56 px-3 py-3">
                    <span className="block font-medium break-words">{row.label}</span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {labels.docTypes[row.docType]}
                    </span>
                    {row.employeeName ? (
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {labels.employee}: {row.employeeName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {row.requestStatus ? (
                      <Status
                        value={row.requestStatus}
                        label={labels.requestStatuses[row.requestStatus]}
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        <ScanLine aria-hidden="true" className="inline size-3.5" />
                        <span className="sr-only">{labels.unavailable}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.reviewStatus ? (
                      <Status
                        value={row.reviewStatus}
                        label={labels.reviewStatuses[row.reviewStatus]}
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        <ScanLine aria-hidden="true" className="inline size-3.5" />
                        <span className="sr-only">{labels.unavailable}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatDate(row.dueAt, dateFormatter, labels.unavailable)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatDate(row.expiresOn, dateFormatter, labels.unavailable)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatTimestamp(
                      row.uploadedAt,
                      timestampFormatter,
                      labels.unavailable,
                      labels.dubaiTime,
                    )}
                  </td>
                  <td className="max-w-44 px-3 py-3 text-xs">
                    <span className="block break-all">{row.mimeType ?? labels.unavailable}</span>
                    <span className="text-muted-foreground mt-1 block">
                      {formatSize(
                        row.sizeBytes,
                        integerFormatter,
                        decimalFormatter,
                        labels.units,
                        labels.unavailable,
                      )}
                    </span>
                  </td>
                  <td className="max-w-48 px-3 py-3 text-xs">
                    <span className="block">
                      {labels.requester}: {row.requesterName ?? labels.unknownActor}
                    </span>
                    <span className="text-muted-foreground mt-1 block">
                      {labels.reviewer}: {row.reviewerName ?? labels.unknownActor}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <DocumentActions
                      kind="row"
                      slug={slug}
                      row={{
                        entityKind: row.entityKind,
                        documentId: row.documentId,
                        versionId: row.versionId,
                        reviewStatus: row.reviewStatus,
                      }}
                      locale={locale}
                      labels={actionLabels}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DocumentQueuePagination
        slug={slug}
        query={query}
        page={page}
        totalPages={totalPages}
        labels={{
          result: labels.result,
          pageCount: labels.pageCount,
          pagination: labels.pagination,
          previous: labels.previous,
          next: labels.next,
        }}
      />
    </div>
  );
}
