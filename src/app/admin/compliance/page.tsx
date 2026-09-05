import { getTranslations } from 'next-intl/server';

import { ComplianceOverviewUnavailable } from '@/components/admin/management/ComplianceOverviewUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminCompliancePage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.compliance');
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <ComplianceOverviewUnavailable
        labels={{
          overview: t('overview'),
          controls: t('controls'),
          evidence: t('evidence'),
          retention: t('retention'),
          erasure: t('erasure'),
          unavailable: t('unavailable'),
          description: t('description'),
          guidance: t('guidance'),
          unavailableTitle: t('unavailableTitle'),
          unavailableDescription: t('unavailableDescription'),
          openEvidence: t('openEvidence'),
          actionExplanation: t('actionExplanation'),
        }}
      />
    </div>
  );
}
