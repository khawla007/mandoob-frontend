import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { UploadDocumentDialog } from './UploadDocumentDialog';
import { OpenSignedUrlButton } from './OpenSignedUrlButton';
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

function reviewBadgeFor(
  status: ReviewStatus,
  labels: { pending: string; approved: string; rejected: string },
): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (status === 'pending') return { label: labels.pending, variant: 'secondary' };
  if (status === 'approved') return { label: labels.approved, variant: 'default' };
  return { label: labels.rejected, variant: 'destructive' };
}

function dueLine(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days · ${iso.slice(0, 10)}`;
}

type AwaitingProps = {
  variant: 'awaiting';
  slug: string;
  request: OpenRequestEntry;
  rejection: { note: string | null; reviewedAt: string } | null;
};

type SubmittedProps = {
  variant: 'submitted';
  slug: string;
  doc: DocumentListEntry;
};

export async function DocumentRequestRow(props: AwaitingProps | SubmittedProps) {
  const t = await getTranslations('customer');
  const reviewLabels = {
    pending: t('pendingReview'),
    approved: t('approved'),
    rejected: t('rejected'),
  };
  if (props.variant === 'awaiting') {
    const { slug, request, rejection } = props;
    const due = dueLine(request.dueAt);
    return (
      <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
        <div className="min-w-0">
          <div className="text-sm font-medium">{request.label}</div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {DOC_TYPE_LABELS[request.docType]}
            {due && <> · {due}</>}
          </div>
          {request.notes && (
            <div className="text-muted-foreground mt-1 text-xs">{request.notes}</div>
          )}
          {rejection && (
            <div className="border-destructive/40 bg-destructive/5 text-destructive mt-2 rounded-md border px-2 py-1.5 text-xs">
              <span className="font-medium">{t('reviewerNote')}</span>{' '}
              {rejection.note ?? t('pleaseReupload')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={rejection ? 'destructive' : 'secondary'}>
            {rejection ? t('reUploadNeeded') : t('requested')}
          </Badge>
          <UploadDocumentDialog
            slug={slug}
            docType={request.docType}
            requestId={request.id}
            label={request.label}
          />
        </div>
      </li>
    );
  }

  const { slug, doc } = props;
  const version = doc.currentVersion;
  const badge = version ? reviewBadgeFor(version.reviewStatus, reviewLabels) : null;
  const title = doc.label ?? DOC_TYPE_LABELS[doc.docType];

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">
          {DOC_TYPE_LABELS[doc.docType]}
          {version && <> · uploaded {new Date(version.createdAt).toLocaleDateString()}</>}
        </div>
        {version?.reviewNote && version.reviewStatus === 'rejected' && (
          <div className="border-destructive/40 bg-destructive/5 text-destructive mt-2 rounded-md border px-2 py-1.5 text-xs">
            <span className="font-medium">{t('reviewerNote')}</span> {version.reviewNote}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        {version && <OpenSignedUrlButton slug={slug} versionId={version.id} />}
      </div>
    </li>
  );
}
