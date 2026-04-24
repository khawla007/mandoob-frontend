import { requireRole } from '@/lib/auth/require-role';
import { getProfileCard } from '@/lib/data/profile';
import { ProfileCardView } from '@/components/tenant/ProfileCardView';

export const dynamic = 'force-dynamic';

export default async function EmployeeHome() {
  const session = await requireRole('employee');
  const profile = await getProfileCard(session.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Visa, Emirates ID, and document details attached to your account.
        </p>
      </div>
      {profile && <ProfileCardView profile={profile} title="Identity" />}
    </div>
  );
}
