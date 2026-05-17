import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { readSelfCustomer } from '@/lib/data/account-self';
import { listDocumentsForClient, listOpenRequestsForClient } from '@/lib/data/documents';
import { DocumentRequestRow } from '@/components/customer/DocumentRequestRow';

export const dynamic = 'force-dynamic';

// TODO Step 18: send customer email/in-app notification when a PRO inserts a
// document_requests row (template lives in the comms engine, not here).
export default async function DocumentsPage({ params }: { params: Promise<{ tenant: string }> }) {
  await requireRole('customer', 'super_admin');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const t = await getTranslations('customer');

  const customer = await readSelfCustomer();
  const linkedClientId = customer.linkedClientId;

  if (!linkedClientId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('documents')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('longCopy.documentsIntro')}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('accountNotLinked')}</CardTitle>
            <CardDescription>
              {t('longCopy.accountNotLinkedNote')}{' '}
              <Link
                href={`/t/${tenant.slug}/account`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {t('viewAllDocuments')}
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [docs, openRequests] = await Promise.all([
    listDocumentsForClient(tenant.id, linkedClientId),
    listOpenRequestsForClient(tenant.id, linkedClientId),
  ]);

  // Map the latest rejection note onto each open request so the row can show
  // the reviewer's reason above the upload button.
  const rejectionByRequest = new Map<string, { note: string | null; reviewedAt: string }>();
  for (const d of docs) {
    if (d.request && d.currentVersion?.reviewStatus === 'rejected') {
      rejectionByRequest.set(d.request.id, {
        note: d.currentVersion.reviewNote,
        reviewedAt: d.currentVersion.reviewedAt ?? d.currentVersion.createdAt,
      });
    }
  }

  const submitted = docs.filter((d) => d.currentVersion);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('documents')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('longCopy.documentsIntro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('awaitingYourAction')}</CardTitle>
          <CardDescription>{t('longCopy.awaitingDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {openRequests.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('allCaughtUp')}</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {openRequests.map((req) => (
                <DocumentRequestRow
                  key={req.id}
                  variant="awaiting"
                  slug={tenant.slug}
                  request={req}
                  rejection={rejectionByRequest.get(req.id) ?? null}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('submitted')}</CardTitle>
          <CardDescription>{t('longCopy.submittedDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t('noSubmittedDocuments')}
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {submitted.map((doc) => (
                <DocumentRequestRow
                  key={doc.documentId}
                  variant="submitted"
                  slug={tenant.slug}
                  doc={doc}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
