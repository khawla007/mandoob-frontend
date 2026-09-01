import { getTranslations } from 'next-intl/server';

import { PlanManagementUnavailable } from '@/components/admin/management/PlanManagementUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminPlansPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.plans');
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <PlanManagementUnavailable
        labels={{
          comparison: t('comparison'),
          cadence: t('cadence'),
          allowances: t('allowances'),
          addOns: t('addOns'),
          enforcement: t('enforcement'),
          unavailable: t('unavailable'),
          description: t('description'),
          guidance: t('guidance'),
          unavailableTitle: t('unavailableTitle'),
          unavailableDescription: t('unavailableDescription'),
          save: t('save'),
          actionExplanation: t('actionExplanation'),
        }}
      />
    </div>
  );
}
