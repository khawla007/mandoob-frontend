import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { readProLifecycleDetail } from '@/lib/data/pro-lifecycle-detail';
import { ApiError } from '@/lib/errors';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';

export default async function ProLifecycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await requirePlatformOperator();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let snapshot;
  try {
    snapshot = await readProLifecycleDetail(operator.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const t = await getTranslations('admin.user.proRegistry');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {t('detailEyebrow')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {snapshot.profile.fullName ?? t('unnamed')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('detailDescription')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/users/${snapshot.profile.id}/edit`}>{t('editProfile')}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('summaryTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">{t('email')}</dt>
              <dd className="mt-1 text-sm">
                {snapshot.profile.emailUnavailable ? t('emailUnavailable') : snapshot.profile.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('accountStatus')}</dt>
              <dd className="mt-1">
                <Badge variant="outline">{t(`account.${snapshot.profile.accountStatus}`)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('credentialStatus')}</dt>
              <dd className="mt-1 text-sm">
                {snapshot.credentials[0]
                  ? t(`credential.${snapshot.credentials[0].state}`)
                  : t('notAvailable')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('assignmentStatus')}</dt>
              <dd className="mt-1 text-sm">
                {snapshot.assignment?.companyName ?? t('unassigned')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
