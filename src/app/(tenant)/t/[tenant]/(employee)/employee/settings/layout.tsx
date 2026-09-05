import { ReactNode } from 'react';
import { SettingsTabs } from '@/components/account/SettingsTabs';
import { getTranslations } from 'next-intl/server';
import { employeePortalHref } from '@/lib/data/employee-portal-workspace';

export default async function EmployeeSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const base = employeePortalHref(slug, 'settings');
  const t = await getTranslations('employee.settings');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: base, label: t('profileTab') },
          { href: `${base}/security`, label: t('securityTab') },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
