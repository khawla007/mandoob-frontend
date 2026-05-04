'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, MessageSquareWarning, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RequestDocumentDialog } from '@/components/pro/RequestDocumentDialog';
import {
  getDocumentSignedUrlAction,
  reviewDocumentVersionAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/clients/[clientId]/documents/actions';
import type { DocumentListEntry, OpenRequestEntry } from '@/lib/data/documents';
import type { DocType } from '@/lib/validation/document';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  passport: 'Passport',
  visa: 'Visa',
  emirates_id: 'Emirates ID',
  trade_license: 'Trade license',
  ejari: 'Ejari',
  moa: 'MoA',
  shareholder_id: 'Shareholder ID',
  other: 'Other',
};

type ReviewStatus = NonNullable<DocumentListEntry['currentVersion']>['reviewStatus'];

const REVIEW_BADGE: Record<
  ReviewStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending review', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function DocumentsTab(props: {
  slug: string;
  clientId: string;
  documents: DocumentListEntry[];
  openRequests: OpenRequestEntry[];
}) {
  const { slug, clientId, documents, openRequests } = props;
  const empty = documents.length === 0 && openRequests.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <FileText className="size-4" />
          <span>
            {documents.length} uploaded · {openRequests.length} awaiting upload
          </span>
        </div>
        <RequestDocumentDialog slug={slug} clientId={clientId} />
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <FileText className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-medium">No documents yet</p>
          <p className="text-muted-foreground mt-1 text-sm">Request one to get started.</p>
        </div>
      ) : (
        <>
          {openRequests.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-sm font-semibold">Awaiting upload</h3>
              <ul className="divide-y rounded-lg border">
                {openRequests.map((req) => (
                  <li key={req.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                    <div>
                      <div className="font-medium">{req.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {DOC_TYPE_LABELS[req.docType]}
                        {req.dueAt && <> · due {new Date(req.dueAt).toLocaleDateString()}</>}
                      </div>
                      {req.notes && (
                        <div className="text-muted-foreground mt-1 text-xs">{req.notes}</div>
                      )}
                    </div>
                    <Badge variant="outline">Pending upload</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {documents.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-sm font-semibold">Documents</h3>
              <ul className="divide-y rounded-lg border">
                {documents.map((doc) => (
                  <DocumentRow key={doc.documentId} doc={doc} slug={slug} clientId={clientId} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DocumentRow(props: { doc: DocumentListEntry; slug: string; clientId: string }) {
  const { doc, slug, clientId } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const version = doc.currentVersion;
  const badge = version ? REVIEW_BADGE[version.reviewStatus] : null;

  function onOpen() {
    if (!version) return;
    setError(null);
    startTransition(async () => {
      const result = await getDocumentSignedUrlAction(slug, version.id);
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    });
  }

  function onReview(status: 'approved' | 'rejected', requireNote = false) {
    if (!version) return;
    let note: string | undefined;
    if (requireNote) {
      const entered = window.prompt('Reason (shown to the customer):');
      if (entered === null) return;
      const trimmed = entered.trim();
      if (!trimmed) return;
      note = trimmed.slice(0, 280);
    }
    setError(null);
    startTransition(async () => {
      const result = await reviewDocumentVersionAction(slug, clientId, version.id, {
        status,
        note,
      });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{doc.label ?? DOC_TYPE_LABELS[doc.docType]}</div>
          <div className="text-muted-foreground text-xs">
            {DOC_TYPE_LABELS[doc.docType]}
            {version && <> · uploaded {new Date(version.createdAt).toLocaleDateString()}</>}
            {version?.reviewNote && version.reviewStatus === 'rejected' && (
              <> · note: {version.reviewNote}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          {version && (
            <Button type="button" variant="outline" size="sm" onClick={onOpen} disabled={pending}>
              Open
            </Button>
          )}
          {version && version.reviewStatus !== 'approved' && (
            <Button type="button" size="sm" onClick={() => onReview('approved')} disabled={pending}>
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
          )}
          {version && version.reviewStatus !== 'rejected' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onReview('rejected', true)}
                disabled={pending}
              >
                <MessageSquareWarning className="size-4" />
                Request changes
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onReview('rejected', true)}
                disabled={pending}
              >
                <XCircle className="size-4" />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}
