import { ReactNode } from 'react';
import { SettingsTabs } from '@/components/account/SettingsTabs';

export default async function EmployeeSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const base = `/t/${slug}/employee/settings`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Account configuration.</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: base, label: 'Profile' },
          { href: `${base}/security`, label: 'Security' },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
