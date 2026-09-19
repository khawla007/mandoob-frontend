import { getTranslations } from 'next-intl/server';

import { PlanManagementUnavailable } from '@/components/admin/management/PlanManagementUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminPlansPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.plans');
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace space-y-6 [&_section.grid>div]:rounded-[14px] [&_section.grid>div]:p-5">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        className="admin-operational-heading"
      />
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
