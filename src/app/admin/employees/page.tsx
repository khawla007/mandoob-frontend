import { getTranslations } from 'next-intl/server';

import { AdminOversightWorkspace } from '@/components/admin/management/AdminOversightWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { AdminEmployeeTable } from '@/components/admin/management/P308OversightTables';
import { loadAdminEmployeeOversight } from '@/lib/renewals/admin-oversight';

export const dynamic = 'force-dynamic';

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  const raw = (await searchParams).page;
  const page = Math.min(10_000, Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1));
  const [t, p, oversight] = await Promise.all([
    getTranslations('admin.management.employees'),
    getTranslations('p308.adminEmployees'),
    loadAdminEmployeeOversight(page),
  ]);

  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace admin-oversight-workspace space-y-6">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        className="admin-operational-heading"
      />
      {oversight.state === 'data' ? (
        <AdminEmployeeTable {...oversight} t={p} />
      ) : (
        <AdminOversightWorkspace
          summaries={[t('summaries.visaRisk'), t('summaries.eidRisk'), t('summaries.renewalRisk')]}
          filters={[t('filters.search'), t('filters.company'), t('filters.risk')]}
          queueTitle={t('queueTitle')}
          queueDescription={t('queueDescription')}
          stateGuidance={t('guidance')}
          unavailableTitle={t('unavailableTitle')}
          unavailableLabel={t('unavailableTitle')}
          unavailableDescription={t('unavailableDescription')}
          actionLabel={t('action')}
          actionExplanation={t('actionExplanation')}
        />
      )}
    </div>
  );
}
