import { ProfileTab } from '@/components/account/ProfileTab';
import { requireAccountUser } from '@/lib/auth/require-account-user';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  await requireAccountUser();
  return <ProfileTab />;
}
