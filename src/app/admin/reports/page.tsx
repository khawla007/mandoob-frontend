import { getTranslations } from 'next-intl/server';

import { ReportCatalogUnavailable } from '@/components/admin/management/ReportCatalogUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminReportsPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.reports');
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace space-y-6 [&_section.grid>div]:rounded-[14px] [&_section.grid>div]:p-5">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        className="admin-operational-heading"
      />
      <ReportCatalogUnavailable
        labels={{
          catalog: t('catalog'),
          scope: t('scope'),
          period: t('period'),
          format: t('format'),
          delivery: t('delivery'),
          unavailable: t('unavailable'),
          description: t('description'),
          guidance: t('guidance'),
          unavailableTitle: t('unavailableTitle'),
          unavailableDescription: t('unavailableDescription'),
          export: t('export'),
          actionExplanation: t('actionExplanation'),
        }}
      />
    </div>
  );
}
