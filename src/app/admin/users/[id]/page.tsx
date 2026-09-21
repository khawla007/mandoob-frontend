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
import { ApiError } from '@/lib/errors';
import { isUuid } from '@/lib/util/uuid';
import { loadProLifecyclePage } from './page-orchestration';

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
    snapshot = await loadProLifecyclePage(operator.id, id, timelineSelection.cursor);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { identity, credentialState, termsState, timelineState } = snapshot;

  const t = await getTranslations('admin.user.proRegistry');
  return (
    <div className="admin-management-signal admin-operational-workspace user-management-workspace space-y-6">
      <div className="admin-operational-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {t('detailEyebrow')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {identity.profile.fullName ?? t('unnamed')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('detailDescription')}</p>
        </div>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/admin/users/${identity.profile.id}/edit`}>{t('editProfile')}</Link>
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
                {identity.profile.emailUnavailable ? t('emailUnavailable') : identity.profile.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('accountStatusLabel')}</dt>
              <dd className="mt-1">
                <ProAccountStatusBadge
                  status={identity.profile.accountStatus}
                  label={t(`account.${identity.profile.accountStatus}`)}
                />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('credentialStatus')}</dt>
              <dd className="mt-1">
                {credentialState.kind === 'ready' && credentialState.credentials[0] ? (
                  <ProCredentialStatusBadge
                    state={credentialState.credentials[0].state}
                    label={t(`credential.${credentialState.credentials[0].state}`)}
                  />
                ) : (
                  t('notAvailable')
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('assignmentStatus')}</dt>
              <dd className="mt-1 text-sm">
                {identity.assignment
                  ? (identity.assignment.companyName ?? t('notAvailable'))
                  : t('unassigned')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <ProCredentialPanel
        userId={identity.profile.id}
        credentials={credentialState.kind === 'ready' ? credentialState.credentials : []}
        evidence={credentialState.kind === 'ready' ? credentialState.evidence : []}
        sourceState={credentialState}
      />
      <ProCommercialTermsPanel
        userId={identity.profile.id}
        terms={termsState.kind === 'ready' ? termsState.terms : []}
        sourceState={termsState}
      />
      <ProLifecycleTimeline
        userId={identity.profile.id}
        timelinePage={
          timelineState.kind === 'ready'
            ? timelineState.timelinePage
            : { items: [], nextCursor: null }
        }
        invalidCursor={timelineSelection.invalid}
        retryCursor={timelineSelection.cursor}
        sourceState={timelineState}
      />
    </div>
  );
}
