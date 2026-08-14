'use client';

import { useState, useTransition } from 'react';
import { Clock3, ExternalLink, LoaderCircle } from 'lucide-react';

import {
  loadVersionHistoryAction,
  openDocumentVersionAction,
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
import type { DocumentVersionHistoryEntry } from '@/lib/data/pro-document-center';

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
  unknownActor: string;
  dubaiTime: string;
  units: { bytes: string; kb: string; mb: string; gb: string };
  statuses: Record<DocumentVersionHistoryEntry['reviewStatus'], string>;
  errors: Record<string, string>;
};

function formatTimestamp(value: string | null, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

function formatSize(bytes: number, locale: string, units: VersionHistoryLabels['units']): string {
  const levels = [units.bytes, units.kb, units.mb, units.gb];
  let value = bytes;
  let level = 0;
  while (value >= 1024 && level < levels.length - 1) {
    value /= 1024;
    level += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: level === 0 ? 0 : 1 }).format(value)} ${levels[level]}`;
}

export function VersionHistoryDialog({
  slug,
  documentId,
  locale,
  labels,
}: {
  slug: string;
  documentId: string;
  locale: string;
  labels: VersionHistoryLabels;
}) {
  const [versions, setVersions] = useState<DocumentVersionHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [opening, startOpening] = useTransition();

  function onOpenChange(open: boolean) {
    if (!open || versions !== null || loading) return;
    setError(null);
    startLoading(async () => {
      const result = await loadVersionHistoryAction(slug, documentId);
      if (result.ok) {
        setVersions(result.data);
      } else {
        setError(labels.errors[result.messageKey] ?? labels.errors.unexpected);
      }
    });
  }

  function openVersion(version: DocumentVersionHistoryEntry) {
    setOpeningId(version.versionId);
    setError(null);
    startOpening(async () => {
      const result = await openDocumentVersionAction(slug, version.versionId);
      if (result.ok) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      } else {
        setError(labels.errors[result.messageKey] ?? labels.errors.unexpected);
      }
      setOpeningId(null);
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Clock3 aria-hidden="true" />
          {labels.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={labels.close}
        className="max-h-[min(46rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        <div aria-live="polite" className="min-h-12">
          {loading ? (
            <div
              role="status"
              className="text-muted-foreground flex items-center gap-2 py-6 text-sm"
            >
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              {labels.loading}
            </div>
          ) : error ? (
            <p role="alert" className="text-destructive py-3 text-sm">
              {error}
            </p>
          ) : versions?.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">{labels.empty}</p>
          ) : (
            <ol className="divide-y">
              {versions?.map((version) => (
                <li key={version.versionId} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {labels.version} {version.versionNumber}
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
                          {formatTimestamp(version.uploadedAt, locale)} {labels.dubaiTime}
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
                            ? `${formatTimestamp(version.reviewedAt, locale)} ${labels.dubaiTime}`
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
                          {version.mimeType} · {formatSize(version.sizeBytes, locale, labels.units)}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
