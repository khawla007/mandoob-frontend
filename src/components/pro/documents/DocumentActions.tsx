'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, UserRound } from 'lucide-react';

import { openDocumentVersionAction } from '@/app/(tenant)/t/[tenant]/(pro)/documents/actions';
import { Button } from '@/components/ui/button';
import type { DocumentCenterRow } from '@/lib/data/pro-document-center';
import type { DocType } from '@/lib/validation/document';
import { VersionHistoryDialog, type VersionHistoryLabels } from './VersionHistoryDialog';
import { resolvePrimaryDocumentAction } from './document-action-state';
import { openDocumentVersionWithPopup } from './document-open-controller';
import { RequestDocumentDialog } from './RequestDocumentDialog';

type DocumentActionRow = Pick<
  DocumentCenterRow,
  'entityKind' | 'documentId' | 'versionId' | 'reviewStatus'
>;

export type DocumentActionLabels = {
  close: string;
  cancel: string;
  profile: string;
  open: string;
  opening: string;
  popupBlocked: string;
  success: string;
  unavailable: { review: string; expiry: string; description: string };
  request: {
    trigger: string;
    title: string;
    description: string;
    type: string;
    label: string;
    due: string;
    notes: string;
    submit: string;
    pending: string;
  };
  review: {
    approve: string;
    reject: string;
    rejecting: string;
    rejectTitle: string;
    rejectDescription: string;
    note: string;
    approvePending: string;
    rejectPending: string;
  };
  expiry: {
    trigger: string;
    title: string;
    description: string;
    date: string;
    save: string;
    clear: string;
    pending: string;
    externallyManaged: string;
    sources: Record<Exclude<DocumentCenterRow['expirySource'], 'document' | null>, string>;
  };
  docTypes: Record<DocType, string>;
  errors: Record<string, string>;
  history: VersionHistoryLabels;
};

function RowDocumentActions({
  slug,
  row,
  locale,
  labels,
}: {
  slug: string;
  row: DocumentActionRow;
  locale: string;
  labels: DocumentActionLabels;
}) {
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, startOpening] = useTransition();
  const versionId = row.versionId;
  const documentId = row.documentId;
  const companyHref = `/t/${encodeURIComponent(slug)}/company`;
  const primaryAction = resolvePrimaryDocumentAction(row);

  function openCurrentVersion() {
    if (!versionId) return;
    setOpenError(null);
    const request = openDocumentVersionWithPopup({
      openPopup: () => window.open('', '_blank'),
      loadUrl: async () => {
        const result = await openDocumentVersionAction(slug, versionId);
        return result.ok
          ? { ok: true, url: result.data.url }
          : { ok: false, messageKey: result.messageKey };
      },
      onBlocked: () => setOpenError(labels.popupBlocked),
      onFailure: (messageKey) =>
        setOpenError(labels.errors[messageKey] ?? labels.errors.unexpected),
    });
    startOpening(async () => {
      await request;
    });
  }

  return (
    <div className="flex min-w-52 flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {row.reviewStatus === 'pending' && versionId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            title={labels.unavailable.description}
            data-document-action="review-unavailable"
          >
            {labels.unavailable.review}
          </Button>
        ) : null}

        {versionId ? (
          <Button
            type="button"
            size="sm"
            variant={primaryAction === 'open' ? 'default' : 'outline'}
            disabled={opening}
            onClick={openCurrentVersion}
            data-document-action="open"
            data-primary={primaryAction === 'open' ? 'true' : undefined}
          >
            <ExternalLink aria-hidden="true" />
            {opening ? labels.opening : labels.open}
          </Button>
        ) : null}

        {documentId ? (
          <VersionHistoryDialog
            slug={slug}
            documentId={documentId}
            locale={locale}
            labels={labels.history}
            primary={primaryAction === 'history'}
          />
        ) : null}

        {documentId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled
            title={labels.unavailable.description}
            data-document-action="expiry-unavailable"
          >
            <CalendarClock aria-hidden="true" />
            {labels.unavailable.expiry}
          </Button>
        ) : null}

        <Button
          asChild
          type="button"
          size="sm"
          variant={primaryAction === 'company' ? 'default' : 'ghost'}
          data-document-action="company"
          data-primary={primaryAction === 'company' ? 'true' : undefined}
        >
          <Link href={companyHref}>
            <UserRound aria-hidden="true" />
            {labels.profile}
          </Link>
        </Button>
      </div>
      <div>
        {openError ? (
          <p role="alert" className="text-destructive text-xs">
            {openError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentActions(
  props:
    | {
        kind: 'request';
        slug: string;
        labels: DocumentActionLabels;
      }
    | {
        kind: 'row';
        slug: string;
        row: DocumentActionRow;
        locale: string;
        labels: DocumentActionLabels;
      },
) {
  return props.kind === 'request' ? (
    <RequestDocumentDialog slug={props.slug} labels={props.labels} />
  ) : (
    <RowDocumentActions
      slug={props.slug}
      row={props.row}
      locale={props.locale}
      labels={props.labels}
    />
  );
}
