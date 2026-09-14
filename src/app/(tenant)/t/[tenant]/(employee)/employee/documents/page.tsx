import { getLocale, getTranslations } from 'next-intl/server';
import { FileCheck2, FileClock, FileText, ShieldAlert } from 'lucide-react';

import { OpenEmployeeSignedUrlButton } from '@/components/employee/OpenEmployeeSignedUrlButton';
import { getEmployeeDocumentSignedUrlAction } from './actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  authorizeEmployeePortalRead,
  loadEmployeeDocuments,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00.000Z`),
  );
}

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [workspace, t, tCommon, locale] = await Promise.all([
    loadEmployeeDocuments(access),
    getTranslations('employee.documents'),
    getTranslations('employee.common'),
    getLocale(),
  ]);
  const summary = [
    [t('awaiting'), workspace.awaitingActionCount, FileClock],
    [t('underReview'), workspace.summaries.underReview, FileText],
    [t('approved'), workspace.summaries.approved, FileCheck2],
    [t('rejected'), workspace.summaries.rejected, ShieldAlert],
  ] as const;
  const reviewLabel = (status: string | null) => {
    if (status === 'pending' || status === 'approved' || status === 'rejected')
      return t(`review.${status}`);
    return status ? t('review.submitted') : t('review.missing');
  };

  return (
    <div className="signal-dashboard space-y-5">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('title')}>
        {summary.map(([label, value, Icon]) => (
          <Card key={label} className="signal-panel">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value ?? tCommon('unavailable')}</p>
              </div>
              <Icon aria-hidden="true" className="text-primary size-5" />
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{t('requestsTitle')}</CardTitle>
            <CardDescription>{t('requestsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.requests.kind === 'error' ? (
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
              >
                {t('sourceError')}
              </p>
            ) : workspace.requests.kind !== 'ready' ? (
              <p role="status" className="text-muted-foreground py-6 text-center text-sm">
                {t('requestsEmpty')}
              </p>
            ) : (
              <ul className="divide-y">
                {workspace.requests.value.map((request, index) => {
                  const documentSourceKnown = workspace.documents.kind !== 'error';
                  const submitted =
                    documentSourceKnown &&
                    'value' in workspace.documents &&
                    workspace.documents.value.some(
                      (document) => document.requestId === request.id && document.versionId,
                    );
                  const requestStatus = !documentSourceKnown
                    ? t('request.unavailable')
                    : submitted || request.status === 'fulfilled'
                      ? t('request.fulfilled')
                      : request.status === 'cancelled'
                        ? t('request.cancelled')
                        : t('request.pending');
                  return (
                    <li key={`${request.docType}-${index}`} className="py-4 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{request.label}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {request.dueDate
                              ? t('due', {
                                  date: formatDate(request.dueDate, locale, tCommon('notRecorded')),
                                })
                              : t('noDeadline')}
                          </p>
                          {request.instructions ? (
                            <p className="text-muted-foreground mt-2 text-sm leading-6">
                              {request.instructions}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant={submitted ? 'secondary' : 'outline'}>{requestStatus}</Badge>
                      </div>
                      {documentSourceKnown && !submitted && request.status === 'pending' ? (
                        <div className="bg-muted/40 mt-3 rounded-lg border border-dashed p-3">
                          <p className="text-sm font-medium">{t('uploadUnavailableTitle')}</p>
                          <p className="text-muted-foreground mt-1 text-sm leading-6">
                            {t('uploadUnavailable')}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{t('submittedTitle')}</CardTitle>
            <CardDescription>{t('submittedDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.documents.kind === 'error' ? (
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
              >
                {t('sourceError')}
              </p>
            ) : workspace.documents.kind !== 'ready' ? (
              <p role="status" className="text-muted-foreground py-6 text-center text-sm">
                {t('submittedEmpty')}
              </p>
            ) : (
              <ul className="divide-y">
                {workspace.documents.value.map((document, index) => (
                  <li
                    key={`${document.docType}-${index}`}
                    className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{document.label}</p>
                        <Badge
                          variant={document.reviewStatus === 'rejected' ? 'destructive' : 'outline'}
                        >
                          {reviewLabel(document.reviewStatus)}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {document.uploadedAt
                          ? t('uploaded', {
                              date: formatDate(document.uploadedAt, locale, tCommon('notRecorded')),
                            })
                          : tCommon('noFile')}
                      </p>
                      {document.rejectionInstruction ? (
                        <p className="text-destructive mt-2 text-sm">
                          {document.rejectionInstruction}
                        </p>
                      ) : null}
                    </div>
                    {document.versionId ? (
                      <OpenEmployeeSignedUrlButton
                        action={getEmployeeDocumentSignedUrlAction.bind(
                          null,
                          access.tenant.slug,
                          document.versionId,
                        )}
                      />
                    ) : (
                      <Badge variant="outline">{tCommon('noFile')}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {workspace.hasMore ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('hasMore')}
        </p>
      ) : null}
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('uploadUnavailableTitle')}</CardTitle>
          <CardDescription>{t('formats')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-muted-foreground text-sm leading-6">
            {t('uploadUnavailable')}
          </p>
          <p className="text-muted-foreground mt-3 text-sm">{t('versionUnavailable')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
