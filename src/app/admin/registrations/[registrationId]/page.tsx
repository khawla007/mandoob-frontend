import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { RegistrationWorkspace } from '@/components/registration/RegistrationWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { registrationWorkspaceLabels } from '@/lib/registration/labels';
import { loadRegistrationPresentation } from '@/lib/registration/db-adapter';

export const dynamic = 'force-dynamic';
const registrationIdSchema = z.string().uuid();

export default async function AdminRegistrationDetailPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  // requirePlatformOperator enforces admin/super_admin + MFA + AAL2 (fail closed).
  const session = await requirePlatformOperator();
  const { registrationId } = await params;
  if (!registrationIdSchema.safeParse(registrationId).success) notFound();
  const [t, locale, state] = await Promise.all([
    getTranslations('registration'),
    getLocale(),
    loadRegistrationPresentation(registrationId, {
      role: 'operator',
      actorId: session.id,
      actorAal: session.aal,
    }),
  ]);
  // Fail closed on a guessed / forbidden / non-existent id — no existence
  // disclosure: an unavailable contract read is indistinguishable from absence.
  if (state.kind === 'unavailable' || state.kind === 'error') notFound();
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
