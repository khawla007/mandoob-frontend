import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type RevokeAllSessionsStore = {
  revoke(userId: string): Promise<{ data: number | null; error: unknown }>;
};

function createRevokeAllSessionsStore(): RevokeAllSessionsStore {
  const admin = createSupabaseServiceRoleClient();
  return {
    revoke: async (userId) =>
      admin.rpc('revoke_all_user_auth_sessions', {
        p_user_id: userId,
      }),
  };
}

export async function revokeAllSessionsWith(
  store: RevokeAllSessionsStore,
  userId: string,
): Promise<void> {
  const { data, error } = await store.revoke(userId);
  if (error || data === null) {
    throw new ApiError('INTERNAL', 'Could not revoke sessions', 500);
  }
}

export async function revokeAllSessions(userId: string): Promise<void> {
  return revokeAllSessionsWith(createRevokeAllSessionsStore(), userId);
}
