import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getActiveDocRequests } from '@/lib/mocks/customer-portal';
import { DocumentRequestRow } from '@/components/customer/DocumentRequestRow';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const docs = await getActiveDocRequests();
  const awaitingYou = docs.filter((d) => d.status === 'requested');
  const submitted = docs.filter((d) => d.status !== 'requested');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload requested documents and track items already submitted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Awaiting your action</CardTitle>
          <CardDescription>Items your PRO firm needs from you.</CardDescription>
        </CardHeader>
        <CardContent>
          {awaitingYou.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              All caught up. No documents pending upload.
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {awaitingYou.map((d) => (
                <DocumentRequestRow key={d.id} row={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submitted</CardTitle>
          <CardDescription>Documents already uploaded or under PRO review.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No submitted documents yet.
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {submitted.map((d) => (
                <DocumentRequestRow key={d.id} row={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
