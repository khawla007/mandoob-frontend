import { getLocale, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import type {
  CustomerDocumentRequest,
  CustomerSubmittedDocument,
} from '@/lib/data/customer-document-center';
import { OpenSignedUrlButton } from './OpenSignedUrlButton';
import { UploadDocumentDialog } from './UploadDocumentDialog';

type Props =
  | {
      variant: 'request';
      slug: string;
      request: CustomerDocumentRequest;
    }
  | { variant: 'submitted'; slug: string; document: CustomerSubmittedDocument };

export async function DocumentRequestRow(props: Props) {
  const [t, docTypes, locale] = await Promise.all([
    getTranslations('customer.documentCenter'),
    getTranslations('customer.docTypeLabels'),
    getLocale(),
  ]);
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  });

  if (props.variant === 'request') {
    const { request, slug } = props;
    return (
      <li className="flex min-w-0 flex-wrap items-start justify-between gap-4 py-4 first:pt-0">
        <div className="max-w-2xl min-w-0">
          <p className="font-medium">{request.label}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {docTypes(request.docType)} ·{' '}
            {request.dueAt
              ? t('due', { date: timestamp.format(new Date(request.dueAt)) })
              : t('noDueDate')}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {request.instructions ?? t('instructionsUnavailable')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t('uploadRequired')}</Badge>
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

  const { document, slug } = props;
  const version = document.currentVersion;
  const title = document.label ?? docTypes(document.docType);
  return (
    <li className="flex min-w-0 flex-wrap items-start justify-between gap-4 py-4 first:pt-0">
      <div className="max-w-2xl min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {docTypes(document.docType)}
          {version
            ? ` · ${t('uploaded', { date: timestamp.format(new Date(version.uploadedAt)) })}`
            : ''}
        </p>
        {version ? (
          <>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('fileMeta', {
                mime: version.mimeType,
                size: Math.ceil(version.sizeBytes / 1024),
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">{t('currentVersion')}</Badge>
              <Badge variant="outline">{t(`scanStatus.${version.scanStatus}`)}</Badge>
              <Badge variant={version.reviewStatus === 'rejected' ? 'destructive' : 'secondary'}>
                {t(`reviewStatus.${version.reviewStatus}`)}
              </Badge>
            </div>
          </>
        ) : null}
        {version?.reviewStatus === 'rejected' ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive mt-3 rounded-md border p-2 text-sm">
            <span className="font-medium">{t('rejectionReason')}</span>{' '}
            {version.rejectionReason ?? t('rejectionReasonUnavailable')}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {version?.reviewStatus === 'rejected' && document.requestId ? (
          <UploadDocumentDialog
            slug={slug}
            docType={document.docType}
            requestId={document.requestId}
            label={title}
          />
        ) : null}
        {version ? <OpenSignedUrlButton slug={slug} versionId={version.id} /> : null}
      </div>
    </li>
  );
}
