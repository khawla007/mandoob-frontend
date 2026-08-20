import type { Role } from '@/lib/auth/roles';

export type InvitedProfile = {
  id: string;
  full_name: string;
  phone: string;
  status: 'invited';
  tenant_id: string | null;
  locale: 'en';
  role: Role;
};

type InvitedProfileClient = {
  from(table: 'profiles'): {
    upsert(
      profile: InvitedProfile,
      options: { onConflict: 'id' },
    ): PromiseLike<{ error: unknown | null }>;
  };
};

export async function persistInvitedProfile(
  client: InvitedProfileClient,
  profile: InvitedProfile,
): Promise<void> {
  const { error } = await client.from('profiles').upsert(profile, { onConflict: 'id' });
  if (error) throw error;
}
