import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { RegistrationWorkspace } from '@/components/registration/RegistrationWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { registrationWorkspaceLabels } from '@/lib/registration/labels';
import { loadRegistrationPresentation } from '@/lib/registration/unavailable-adapter';

export const dynamic = 'force-dynamic';
const registrationIdSchema = z.string().uuid();

export default async function AdminRegistrationDetailPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  await requirePlatformOperator();
  const { registrationId } = await params;
  if (!registrationIdSchema.safeParse(registrationId).success) notFound();
  const [t, locale, state] = await Promise.all([
    getTranslations('registration'),
    getLocale(),
    loadRegistrationPresentation(),
  ]);
  return (
    <div className="admin-management-signal admin-operational-workspace registration-management-workspace space-y-6">
      <DashboardPageHeader
        eyebrow={t('admin.detailEyebrow')}
        title={t('admin.detailTitle')}
        description={t('admin.detailUnavailable')}
        className="admin-operational-heading"
      />
      <RegistrationWorkspace
        state={state}
        role="admin"
        locale={locale}
        labels={registrationWorkspaceLabels(t as unknown as (key: string) => string)}
      />
    </div>
  );
}
