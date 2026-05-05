import { readSelfProfile } from '@/lib/data/account-self';
import { ProfileForm } from './ProfileForm';

export async function ProfileTab() {
  const profile = await readSelfProfile();
  return (
    <ProfileForm
      initial={{
        display_name: profile.fullName ?? '',
        phone: profile.phone ?? '',
      }}
      role={profile.role}
      readOnly={{
        email: profile.email ?? '—',
        role: profile.role,
        tenantId: profile.tenantId,
        createdAt: profile.createdAt,
      }}
    />
  );
}
