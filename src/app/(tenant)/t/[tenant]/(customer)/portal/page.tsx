import { requireRole } from '@/lib/auth/require-role';
import { getProfileCard } from '@/lib/data/profile';
import { ProfileCardView } from '@/components/tenant/ProfileCardView';

export const dynamic = 'force-dynamic';

export default async function CustomerPortal() {
  const session = await requireRole('customer');
  const profile = await getProfileCard(session.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile?.fullName ? `, ${profile.fullName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your registration, documents, visas, and renewals will appear here.
        </p>
      </div>
      {profile && <ProfileCardView profile={profile} title="Your account" />}
    </div>
  );
}
