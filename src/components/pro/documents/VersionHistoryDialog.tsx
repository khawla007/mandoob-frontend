'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Clock3, ExternalLink } from 'lucide-react';

import {
  loadVersionHistoryAction,
  openDocumentVersionAction,
  type PublicDocumentVersionHistoryEntry,
} from '@/app/(tenant)/t/[tenant]/(pro)/documents/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { openDocumentVersionWithPopup } from './document-open-controller';
import { VersionHistoryFeedback } from './VersionHistoryFeedback';
import {
  createVersionHistoryController,
  createVersionHistoryFormatters,
} from './version-history-controller';

export type VersionHistoryLabels = {
  trigger: string;
  title: string;
  description: string;
  close: string;
  loading: string;
  empty: string;
  current: string;
  version: string;
  uploaded: string;
  uploadedBy: string;
  review: string;
  reviewedBy: string;
  note: string;
  file: string;
  open: string;
  opening: string;
  popupBlocked: string;
  unknownActor: string;
  dubaiTime: string;
  units: { bytes: string; kb: string; mb: string; gb: string };
  statuses: Record<PublicDocumentVersionHistoryEntry['reviewStatus'], string>;
  errors: Record<string, string>;
};

function formatTimestamp(value: string | null, formatter: Intl.DateTimeFormat): string | null {
  if (!value) return null;
  return formatter.format(new Date(value));
}

function formatSize(
  bytes: number,
  integerFormatter: Intl.NumberFormat,
  decimalFormatter: Intl.NumberFormat,
  units: VersionHistoryLabels['units'],
): string {
  const levels = [units.bytes, units.kb, units.mb, units.gb];
  let value = bytes;
  let level = 0;
  while (value >= 1024 && level < levels.length - 1) {
    value /= 1024;
    level += 1;
  }
  return `${(level === 0 ? integerFormatter : decimalFormatter).format(value)} ${levels[level]}`;
}

export function VersionHistoryDialog({
  slug,
  documentId,
  locale,
  labels,
  primary = false,
}: {
  slug: string;
  documentId: string;
  locale: string;
  labels: VersionHistoryLabels;
  primary?: boolean;
}) {
  const [versions, setVersions] = useState<PublicDocumentVersionHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, startOpening] = useTransition();
  const formatters = useMemo(() => createVersionHistoryFormatters(locale), [locale]);

  const historyController = useMemo(
    () =>
      createVersionHistoryController({
        load: async () => {
          try {
            return await loadVersionHistoryAction(slug, documentId);
          } catch {
            return {
              ok: false as const,
              code: 'INTERNAL',
              messageKey: 'documents.errors.unexpected' as const,
            };
          }
        },
        apply: (result) => {
          if (result.ok) {
            setVersions(result.data);
            setError(null);
          } else {
            setVersions(null);
            setError(labels.errors[result.messageKey] ?? labels.errors.unexpected);
          }
        },
        setPending: setLoading,
      }),
    [documentId, labels, slug],
  );

  useEffect(() => () => historyController.close(), [historyController]);

  function onOpenChange(open: boolean) {
    if (!open) {
      historyController.close();
      return;
    }
    setVersions(null);
    setError(null);
    void historyController.open();
  }

  function openVersion(version: PublicDocumentVersionHistoryEntry) {
    setOpeningId(version.versionId);
    setError(null);
    const request = openDocumentVersionWithPopup({
      openPopup: () => window.open('', '_blank'),
      loadUrl: async () => {
        const result = await openDocumentVersionAction(slug, version.versionId);
        return result.ok
          ? { ok: true, url: result.data.url }
          : { ok: false, messageKey: result.messageKey };
      },
      onBlocked: () => setError(labels.popupBlocked),
      onFailure: (messageKey) => setError(labels.errors[messageKey] ?? labels.errors.unexpected),
    });
    startOpening(async () => {
      await request;
      setOpeningId(null);
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={primary ? 'default' : 'ghost'}
          data-document-action="history"
          data-primary={primary ? 'true' : undefined}
        >
          <Clock3 aria-hidden="true" />
          {labels.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={labels.close}
        className="document-center-dialog max-h-[min(46rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        <VersionHistoryFeedback
          loading={loading}
          error={error}
          empty={versions?.length === 0}
          loadingLabel={labels.loading}
          emptyLabel={labels.empty}
        >
          <ol className="divide-y">
            {versions?.map((version) => (
              <li key={version.versionId} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {labels.version} {formatters.integer.format(version.versionNumber)}
                    </span>
                    {version.current ? (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                        {labels.current}
                      </span>
                    ) : null}
                    <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
                      {labels.statuses[version.reviewStatus]}
                    </span>
                  </div>
                  <dl className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-foreground font-medium">{labels.uploaded}</dt>
                      <dd>
                        {formatTimestamp(version.uploadedAt, formatters.timestamp)}{' '}
                        {labels.dubaiTime}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground font-medium">{labels.uploadedBy}</dt>
                      <dd>{version.uploaderName ?? labels.unknownActor}</dd>
                    </div>
                    <div>
                      <dt className="text-foreground font-medium">{labels.review}</dt>
                      <dd>
                        {version.reviewedAt
                          ? `${formatTimestamp(version.reviewedAt, formatters.timestamp)} ${labels.dubaiTime}`
                          : labels.statuses[version.reviewStatus]}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground font-medium">{labels.reviewedBy}</dt>
                      <dd>{version.reviewerName ?? labels.unknownActor}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-foreground font-medium">{labels.file}</dt>
                      <dd>
                        {version.mimeType} ·{' '}
                        {formatSize(
                          version.sizeBytes,
                          formatters.integer,
                          formatters.decimal,
                          labels.units,
                        )}
                      </dd>
                    </div>
                    {version.reviewNote ? (
                      <div className="sm:col-span-2">
                        <dt className="text-foreground font-medium">{labels.note}</dt>
                        <dd className="break-words">{version.reviewNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={opening}
                  onClick={() => openVersion(version)}
                  className="self-start"
                >
                  <ExternalLink aria-hidden="true" />
                  {openingId === version.versionId ? labels.opening : labels.open}
                </Button>
              </li>
            ))}
          </ol>
        </VersionHistoryFeedback>
      </DialogContent>
    </Dialog>
  );
}
