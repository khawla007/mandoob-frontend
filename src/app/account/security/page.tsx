import { SecurityTab } from '@/components/account/SecurityTab';
import { requireAccountUser } from '@/lib/auth/require-account-user';
import { MfaTab } from '@/components/account/MfaTab';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireAccountUser();
  return (
    <div className="space-y-10">
      <SecurityTab />
      <MfaTab />
    </div>
  );
}
