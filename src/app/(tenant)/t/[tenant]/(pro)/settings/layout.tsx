import { ReactNode } from 'react';
import { SettingsTabs } from '@/components/account/SettingsTabs';

export default async function ProSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const base = `/t/${slug}/settings`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Workspace and account configuration.</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: base, label: 'Workspace' },
          { href: `${base}/billing`, label: 'Billing' },
          { href: `${base}/profile`, label: 'Profile' },
          { href: `${base}/security`, label: 'Security' },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
