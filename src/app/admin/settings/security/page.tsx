import { SecurityTab } from '@/components/account/SecurityTab';
import { MfaTab } from '@/components/account/MfaTab';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsSecurityPage() {
  return (
    <div className="settings-security-grid grid gap-6 lg:grid-cols-2">
      <SecurityTab />
      <MfaTab />
    </div>
  );
}
