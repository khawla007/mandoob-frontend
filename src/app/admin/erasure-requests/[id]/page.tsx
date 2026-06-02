import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('admin');
  const { id } = await params;
  const request = await getErasureRequestDetail(id);
  if (!request) notFound();
  const canReview = request.status === 'submitted' || request.status === 'under_review';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('erasure.detail.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{request.id}</p>
        </div>
        <Badge variant="secondary">
          {t.has(`erasure.status.${request.status}`)
            ? t(`erasure.status.${request.status}`)
            : request.status.replaceAll('_', ' ')}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('erasure.detail.subjectTitle')}</CardTitle>
            <CardDescription>{t('erasure.detail.subjectDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground">{t('erasure.detail.name')}</div>
              <div className="font-medium">
                {request.subjectName ?? t('erasure.detail.unknown')}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('erasure.detail.email')}</div>
              <div className="font-medium">
                {request.subjectEmail ?? t('erasure.detail.unknown')}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('erasure.detail.kind')}</div>
              <div className="font-medium">
                {t.has(`erasure.subjectKind.${request.subjectKind}`)
                  ? t(`erasure.subjectKind.${request.subjectKind}`)
                  : request.subjectKind}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('erasure.detail.tenant')}</div>
              <div className="font-medium">{request.tenantName ?? request.subjectTenantId}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-muted-foreground">{t('erasure.detail.reason')}</div>
              <div className="font-medium">{request.reason || t('erasure.detail.noReason')}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('erasure.detail.decisionTitle')}</CardTitle>
            <CardDescription>{t('erasure.detail.decisionDescription')}</CardDescription>
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
                {t('erasure.detail.approveExecute')}
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
                <Label htmlFor="rejectionReason">{t('erasure.detail.rejectionReason')}</Label>
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
                {t('erasure.detail.rejectRequest')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('erasure.detail.cascadeTitle')}</CardTitle>
          <CardDescription>{t('erasure.detail.cascadeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="font-medium">{t('erasure.detail.profilePii')}</div>
            <p className="text-muted-foreground mt-1">{t('erasure.detail.profilePiiDesc')}</p>
          </div>
          <div>
            <div className="font-medium">{t('erasure.detail.identityFields')}</div>
            <p className="text-muted-foreground mt-1">{t('erasure.detail.identityFieldsDesc')}</p>
          </div>
          <div>
            <div className="font-medium">{t('erasure.detail.documents')}</div>
            <p className="text-muted-foreground mt-1">{t('erasure.detail.documentsDesc')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
