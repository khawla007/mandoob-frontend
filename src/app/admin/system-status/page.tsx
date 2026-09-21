import { getTranslations } from 'next-intl/server';

import { SystemStatusUnavailable } from '@/components/admin/management/SystemStatusUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminSystemStatusPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.systemStatus');
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace space-y-6 [&_section.grid>div]:rounded-[14px] [&_section.grid>div]:p-5">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        className="admin-operational-heading"
      />
      <SystemStatusUnavailable
        labels={{
          status: t('status'),
          generated: t('generated'),
          monitoring: t('monitoring'),
          source: t('source'),
          unavailable: t('unavailable'),
          description: t('description'),
          guidance: t('guidance'),
          unavailableTitle: t('unavailableTitle'),
          unavailableDescription: t('unavailableDescription'),
          refresh: t('refresh'),
          actionExplanation: t('actionExplanation'),
        }}
      />
    </div>
  );
}
