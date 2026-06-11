import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SettingsTabs } from '@/components/account/SettingsTabs';

export default async function AdminSettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin.settings.layout');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: '/admin/settings', label: t('tabs.profile') },
          { href: '/admin/settings/security', label: t('tabs.security') },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
