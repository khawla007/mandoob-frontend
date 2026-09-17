import { getTranslations } from 'next-intl/server';

import { AdminOversightWorkspace } from '@/components/admin/management/AdminOversightWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminRenewalsPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.renewals');

  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace admin-oversight-workspace space-y-6">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        className="admin-operational-heading"
      />
      <AdminOversightWorkspace
        summaries={[t('summaries.overdue'), t('summaries.week'), t('summaries.days90')]}
        filters={[t('filters.entity'), t('filters.type'), t('filters.status')]}
        queueTitle={t('queueTitle')}
        queueDescription={t('queueDescription')}
        stateGuidance={t('guidance')}
        unavailableTitle={t('unavailableTitle')}
        unavailableLabel={t('unavailableTitle')}
        unavailableDescription={t('unavailableDescription')}
        actionLabel={t('action')}
        actionExplanation={t('actionExplanation')}
      />
    </div>
  );
}
