import { getTranslations } from 'next-intl/server';

import { ReportCatalogUnavailable } from '@/components/admin/management/ReportCatalogUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminReportsPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.reports');
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
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
