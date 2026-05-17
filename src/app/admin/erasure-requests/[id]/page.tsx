import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { getErasureRequestDetail } from '@/lib/data/erasure';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { approveErasureAction, rejectErasureAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminErasureRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('super_admin', 'admin');
  const { id } = await params;
  const request = await getErasureRequestDetail(id);
  if (!request) notFound();
  const canReview = request.status === 'submitted' || request.status === 'under_review';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Erasure request</h1>
          <p className="text-muted-foreground mt-1 text-sm">{request.id}</p>
        </div>
        <Badge variant="secondary">{request.status.replaceAll('_', ' ')}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subject</CardTitle>
            <CardDescription>Identity and tenant context for review.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground">Name</div>
              <div className="font-medium">{request.subjectName ?? 'Unknown'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium">{request.subjectEmail ?? 'Unknown'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Kind</div>
              <div className="font-medium">{request.subjectKind}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Tenant</div>
              <div className="font-medium">{request.tenantName ?? request.subjectTenantId}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-muted-foreground">Reason</div>
              <div className="font-medium">{request.reason || 'No reason provided'}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Decision</CardTitle>
            <CardDescription>Approval executes the anonymization cascade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              action={async (formData) => {
                'use server';
                await approveErasureAction(formData);
              }}
            >
              <input type="hidden" name="requestId" value={request.id} />
              <Button type="submit" disabled={!canReview} className="w-full">
                Approve and execute
              </Button>
            </form>
            <form
              action={async (formData) => {
                'use server';
                await rejectErasureAction(formData);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="requestId" value={request.id} />
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Rejection reason</Label>
                <Textarea
                  id="rejectionReason"
                  name="rejectionReason"
                  rows={4}
                  maxLength={1000}
                  required
                  disabled={!canReview}
                />
              </div>
              <Button type="submit" variant="outline" disabled={!canReview} className="w-full">
                Reject request
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cascade scope</CardTitle>
          <CardDescription>Fields removed on approval.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="font-medium">Profile PII</div>
            <p className="text-muted-foreground mt-1">Name, phone, username, title, bio.</p>
          </div>
          <div>
            <div className="font-medium">Identity fields</div>
            <p className="text-muted-foreground mt-1">
              Passport, visa, and Emirates ID encrypted values.
            </p>
          </div>
          <div>
            <div className="font-medium">Documents</div>
            <p className="text-muted-foreground mt-1">
              Passport, visa, Emirates ID, and shareholder ID document rows.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
