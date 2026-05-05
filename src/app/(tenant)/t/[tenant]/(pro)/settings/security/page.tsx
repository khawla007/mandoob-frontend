import { SecurityTab } from '@/components/account/SecurityTab';
import { MfaTab } from '@/components/account/MfaTab';

export const dynamic = 'force-dynamic';

export default async function ProSettingsSecurityPage() {
  return (
    <div className="space-y-10">
      <SecurityTab />
      <MfaTab />
    </div>
  );
}
