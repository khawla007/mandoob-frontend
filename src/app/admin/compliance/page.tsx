import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { loadRetentionPolicies } from '@/lib/data/reporting-p3-12';

export const dynamic = 'force-dynamic';

export default async function AdminCompliancePage() {
  const session = await requirePlatformOperator();
  const t = await getTranslations('admin.management.compliance');
  const policies = await loadRetentionPolicies(session.id).catch(() => null);
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('retention')}</CardTitle>
          <CardDescription>{t('policyDisclaimer')}</CardDescription>
        </CardHeader>
        <CardContent>
          {policies ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-start">{t('dataClass')}</th>
                    <th className="p-2 text-start">{t('owner')}</th>
                    <th className="p-2 text-start">{t('policyStatus')}</th>
                    <th className="p-2 text-start">{t('runtimeStatus')}</th>
                    <th className="p-2 text-start">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr className="border-b" key={`${policy.dataClass}:${policy.version}`}>
                      <td className="p-2 font-medium">{policy.dataClass}</td>
                      <td className="p-2">{policy.owner}</td>
                      <td className="p-2">{policy.policyStatus}</td>
                      <td className="p-2">{policy.runtimeStatus}</td>
                      <td className="p-2">{policy.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="alert">{t('unavailableTitle')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
