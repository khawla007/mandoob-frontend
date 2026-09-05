import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { DocumentRequestRow } from '@/components/customer/DocumentRequestRow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import {
  groupCustomerSubmittedDocuments,
  loadCustomerDocumentCenter,
} from '@/lib/data/customer-document-center';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const [t, tDocTypes] = await Promise.all([
    getTranslations('customer.documentCenter'),
    getTranslations('customer.docTypeLabels'),
  ]);
  const workspace = access.kind === 'authorized' ? await loadCustomerDocumentCenter(access) : null;
  const heading = (
    <header className="document-center__heading">
      <p className="text-foreground/70 font-mono text-xs font-medium tracking-wider uppercase">
        {t('eyebrow')}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{t('description')}</p>
      {access.kind === 'authorized' ? (
        <p className="text-muted-foreground mt-2 text-xs font-medium">
          {access.company.companyName}
        </p>
      ) : null}
    </header>
  );

  if (!workspace || access.kind !== 'authorized') {
    return (
      <div className="document-center grid min-w-0 gap-6">
        {heading}
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>
              {access.kind === 'unlinked' ? t('unlinkedTitle') : t('unavailableTitle')}
            </CardTitle>
            <CardDescription>
              {access.kind === 'unlinked' ? t('unlinkedDescription') : t('unavailableDescription')}
            </CardDescription>
          </CardHeader>
          {access.kind === 'unlinked' ? (
            <CardContent>
              <Link className="underline underline-offset-4" href="/account">
                {t('reviewAccount')}
              </Link>
            </CardContent>
          ) : null}
        </Card>
      </div>
    );
  }

  const summaries = [
    ['awaiting', workspace.summary.awaiting, 'info'],
    ['underReview', workspace.summary.underReview, 'review'],
    ['approved', workspace.summary.approved, 'success'],
    ['rejected', workspace.summary.rejected, 'urgent'],
  ] as const;
  const submittedGroups =
    workspace.documents.kind === 'ready'
      ? groupCustomerSubmittedDocuments(workspace.documents.value)
      : [];

  return (
    <div className="document-center grid min-w-0 gap-6">
      {heading}

      <section className="document-center__summary-grid grid gap-3" aria-label={t('summaryLabel')}>
        {summaries.map(([key, summary, variant]) => (
          <article
            key={key}
            className={`document-center__summary document-center__summary--${variant} relative min-w-0 overflow-hidden rounded-2xl border p-4`}
          >
            <div className="document-center__summary-pattern absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <p className="text-muted-foreground text-xs font-medium">{t(`summary.${key}`)}</p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
                {summary.kind === 'ready' ? summary.value : '—'}
              </p>
              {summary.kind === 'error' ? (
                <p className="text-destructive mt-1 text-xs">{t('sourceError')}</p>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <section className="signal-panel rounded-2xl border p-4 sm:p-5">
        <header>
          <h2 className="text-lg font-semibold">{t('requestedTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('requestedDescription')}</p>
        </header>
        <div className="mt-4">
          {workspace.requests.kind === 'error' ? (
            <p role="alert" className="text-destructive text-sm">
              {t('queueError')}
            </p>
          ) : null}
          {workspace.requests.kind === 'empty' ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('requestedEmpty')}</p>
          ) : null}
          {workspace.requests.kind === 'ready' ? (
            <ul className="divide-border/60 divide-y">
              {workspace.requests.value.map((request) => (
                <DocumentRequestRow
                  key={request.id}
                  variant="request"
                  slug={slug}
                  request={request}
                />
              ))}
            </ul>
          ) : null}
          {workspace.requests.kind === 'ready' && workspace.requests.hasMore ? (
            <p className="text-muted-foreground mt-3 text-xs">{t('boundedNotice')}</p>
          ) : null}
        </div>
      </section>

      <section className="signal-panel rounded-2xl border p-4 sm:p-5">
        <header>
          <h2 className="text-lg font-semibold">{t('submittedTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('submittedDescription')}</p>
        </header>
        <div className="mt-4">
          {workspace.documents.kind === 'error' ? (
            <p role="alert" className="text-destructive text-sm">
              {t('queueError')}
            </p>
          ) : null}
          {workspace.documents.kind === 'empty' ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('submittedEmpty')}</p>
          ) : null}
          {workspace.documents.kind === 'ready' ? (
            <div className="grid gap-5">
              {submittedGroups.map((group) => (
                <section key={group.docType} aria-labelledby={`document-group-${group.docType}`}>
                  <h3
                    id={`document-group-${group.docType}`}
                    className="text-muted-foreground mb-2 font-mono text-xs font-medium tracking-wider uppercase"
                  >
                    {tDocTypes(group.docType)}
                  </h3>
                  <ul className="divide-border/60 divide-y">
                    {group.documents.map((document) => (
                      <DocumentRequestRow
                        key={document.id}
                        variant="submitted"
                        slug={slug}
                        document={document}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
          {workspace.documents.kind === 'ready' && workspace.documents.hasMore ? (
            <p className="text-muted-foreground mt-3 text-xs">{t('boundedNotice')}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
