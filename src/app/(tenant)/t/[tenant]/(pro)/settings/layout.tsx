import { ReactNode } from 'react';
import { SettingsTabs } from '@/components/account/SettingsTabs';
import { getTranslations } from 'next-intl/server';

export default async function ProSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const t = await getTranslations('pro.settings');
  const base = `/t/${slug}/settings`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: base, label: t('tabs.workspace') },
          { href: `${base}/billing`, label: t('tabs.billing') },
          { href: `${base}/profile`, label: t('tabs.profile') },
          { href: `${base}/security`, label: t('tabs.security') },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
