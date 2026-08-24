import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProCommercialTermsPanel } from '@/components/admin/ProCommercialTermsPanel';
import { ProCredentialPanel } from '@/components/admin/ProCredentialPanel';
import { ProLifecycleTimeline } from '@/components/admin/ProLifecycleTimeline';
import {
  ProAccountStatusBadge,
  ProCredentialStatusBadge,
} from '@/components/admin/ProLifecycleStatusBadge';
import { parseProTimelineSearchParams } from '@/components/admin/pro-lifecycle-ui';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { readProLifecycleDetail } from '@/lib/data/pro-lifecycle-detail';
import { readProLifecycleTimeline } from '@/lib/data/pro-lifecycle-timeline';
import { readProCredentialSnapshot } from '@/lib/data/pro-credentials';
import { readProCommercialTerms } from '@/lib/data/pro-commercial-terms';
import { ApiError } from '@/lib/errors';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';

export default async function ProLifecycleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ timeline?: string | string[] }>;
}) {
  const operator = await requirePlatformOperator();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const timelineSelection = parseProTimelineSearchParams((await searchParams).timeline);
  let snapshot;
  try {
    snapshot = await readProLifecycleDetail(operator.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const [credentialResult, termsResult, timelineResult] = await Promise.allSettled([
    readProCredentialSnapshot(operator.id, id),
    readProCommercialTerms(operator.id, id),
    readProLifecycleTimeline(operator.id, id, 25, timelineSelection.cursor),
  ]);
  const credentialState =
    credentialResult.status === 'fulfilled'
      ? { kind: 'ready' as const, ...credentialResult.value }
      : { kind: 'error' as const };
  const termsState =
    termsResult.status === 'fulfilled'
      ? { kind: 'ready' as const, terms: termsResult.value }
      : { kind: 'error' as const };
  const timelineState =
    timelineResult.status === 'fulfilled'
      ? { kind: 'ready' as const, timelinePage: timelineResult.value }
      : { kind: 'error' as const };

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
        <Button asChild variant="outline" className="min-h-11">
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
              <dt className="text-muted-foreground text-xs">{t('accountStatusLabel')}</dt>
              <dd className="mt-1">
                <ProAccountStatusBadge
                  status={snapshot.profile.accountStatus}
                  label={t(`account.${snapshot.profile.accountStatus}`)}
                />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('credentialStatus')}</dt>
              <dd className="mt-1">
                {snapshot.credentials[0] ? (
                  <ProCredentialStatusBadge
                    state={snapshot.credentials[0].state}
                    label={t(`credential.${snapshot.credentials[0].state}`)}
                  />
                ) : (
                  t('notAvailable')
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('assignmentStatus')}</dt>
              <dd className="mt-1 text-sm">
                {snapshot.assignment
                  ? (snapshot.assignment.companyName ?? t('notAvailable'))
                  : t('unassigned')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <ProCredentialPanel
        userId={snapshot.profile.id}
        credentials={snapshot.credentials}
        evidence={snapshot.evidence}
        sourceState={credentialState}
      />
      <ProCommercialTermsPanel
        userId={snapshot.profile.id}
        terms={snapshot.commercialTerms}
        sourceState={termsState}
      />
      <ProLifecycleTimeline
        userId={snapshot.profile.id}
        timelinePage={snapshot.timeline}
        invalidCursor={timelineSelection.invalid}
        sourceState={timelineState}
      />
    </div>
  );
}
