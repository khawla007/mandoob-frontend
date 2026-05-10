import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { listEmployeeDocuments } from '@/lib/data/employee-portal';
import { OpenEmployeeSignedUrlButton } from '@/components/employee/OpenEmployeeSignedUrlButton';

export const dynamic = 'force-dynamic';

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await requireRole('employee');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.id !== session.tenantId) notFound();

  const documents = await listEmployeeDocuments(session.id, tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Company-issued files linked to your employee record.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="size-5" />
            My documents
          </CardTitle>
          <CardDescription>Downloads use private, short-lived signed links.</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No employee-linked documents yet.
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{doc.label}</p>
                      <Badge variant="outline">{doc.docType.replaceAll('_', ' ')}</Badge>
                      {doc.reviewStatus && <Badge variant="secondary">{doc.reviewStatus}</Badge>}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-AE')}
                      {doc.mimeType ? `, ${doc.mimeType}` : ''}
                    </p>
                  </div>
                  {doc.versionId ? (
                    <OpenEmployeeSignedUrlButton slug={tenant.slug} versionId={doc.versionId} />
                  ) : (
                    <Badge variant="outline">No file</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
