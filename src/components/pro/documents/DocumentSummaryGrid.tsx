import Link from 'next/link';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileClock,
  FileWarning,
  ScanLine,
  type LucideIcon,
} from 'lucide-react';

import { documentCenterHref } from '@/app/(tenant)/t/[tenant]/(pro)/documents/page-logic';
import type {
  DocumentCenterSummary,
  DocumentCenterSummaryResult,
} from '@/lib/data/pro-document-center';
import type {
  DocumentCenterSearch,
  DocumentCenterView,
} from '@/lib/validation/pro-document-center';

export type DocumentSummaryLabels = Record<
  'awaitingUpload' | 'awaitingReview' | 'approved' | 'rejected' | 'expiring' | 'overdue',
  { title: string; helper: string; failed: string; retry: string }
>;

type SummaryItem = {
  key: keyof DocumentCenterSummary;
  view: DocumentCenterView;
  variant: 'info' | 'orange' | 'success' | 'urgent' | 'warning';
  icon: LucideIcon;
  result: DocumentCenterSummaryResult;
  labels: DocumentSummaryLabels[keyof DocumentSummaryLabels];
};

export function DocumentSummaryGrid({
  slug,
  query,
  summary,
  labels,
}: {
  slug: string;
  query: DocumentCenterSearch;
  summary: DocumentCenterSummary;
  labels: DocumentSummaryLabels;
}) {
  const items: SummaryItem[] = [
    {
      key: 'awaitingUpload',
      view: 'requested',
      variant: 'info',
      icon: FileClock,
      result: summary.awaitingUpload,
      labels: labels.awaitingUpload,
    },
    {
      key: 'awaitingReview',
      view: 'submitted',
      variant: 'orange',
      icon: ScanLine,
      result: summary.awaitingReview,
      labels: labels.awaitingReview,
    },
    {
      key: 'approved',
      view: 'approved',
      variant: 'success',
      icon: CheckCircle2,
      result: summary.approved,
      labels: labels.approved,
    },
    {
      key: 'rejected',
      view: 'rejected',
      variant: 'urgent',
      icon: FileWarning,
      result: summary.rejected,
      labels: labels.rejected,
    },
    {
      key: 'expiring',
      view: 'expiring',
      variant: 'warning',
      icon: Clock3,
      result: summary.expiring,
      labels: labels.expiring,
    },
    {
      key: 'overdue',
      view: 'overdue',
      variant: 'urgent',
      icon: CircleAlert,
      result: summary.overdue,
      labels: labels.overdue,
    },
  ];

  return (
    <section className="document-center__summary-grid grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        const href = documentCenterHref(slug, {
          ...query,
          view: item.view,
          page: 1,
          focus: undefined,
        });
        return (
          <Link
            key={item.key}
            href={href}
            aria-current={query.view === item.view ? 'page' : undefined}
            className={`document-center__summary document-center__summary--${item.variant} group focus-visible:ring-ring bg-card hover:bg-muted/40 relative min-w-0 overflow-hidden rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
            data-variant={item.variant}
          >
            <span
              aria-hidden="true"
              className="document-center__summary-pattern inset-block-0 inset-inline-end-0 pointer-events-none absolute w-20 opacity-20"
            />
            <span className="relative flex items-start justify-between gap-4">
              <span className="min-w-0">
                <span className="text-muted-foreground block text-xs font-medium">
                  {item.labels.title}
                </span>
                {item.result.ok ? (
                  <span className="mt-1 block text-2xl font-semibold tabular-nums">
                    {item.result.value}
                  </span>
                ) : (
                  <span className="text-destructive mt-1 block text-sm font-semibold">
                    {item.labels.failed}
                  </span>
                )}
                <span className="text-muted-foreground mt-1 block text-xs">
                  {item.result.ok ? item.labels.helper : item.labels.retry}
                </span>
              </span>
              <span className="bg-muted text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
