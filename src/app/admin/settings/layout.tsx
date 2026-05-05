import { ReactNode } from 'react';
import { SettingsTabs } from '@/components/account/SettingsTabs';

export default function AdminSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Account configuration.</p>
      </div>
      <SettingsTabs
        tabs={[
          { href: '/admin/settings', label: 'Profile' },
          { href: '/admin/settings/security', label: 'Security' },
        ]}
      />
      <div className="pt-2">{children}</div>
    </div>
  );
}
