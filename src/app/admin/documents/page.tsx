import { getTranslations } from 'next-intl/server';

import { AdminOversightWorkspace } from '@/components/admin/management/AdminOversightWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminDocumentsPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.documents');

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      <AdminOversightWorkspace
        summaries={[t('summaries.submitted'), t('summaries.review'), t('summaries.rejected')]}
        filters={[t('filters.company'), t('filters.status'), t('filters.type')]}
        queueTitle={t('queueTitle')}
        queueDescription={t('queueDescription')}
        stateGuidance={t('guidance')}
        unavailableTitle={t('unavailableTitle')}
        unavailableDescription={t('unavailableDescription')}
        actionLabel={t('action')}
        actionExplanation={t('actionExplanation')}
      />
    </div>
  );
}
