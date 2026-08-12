import 'server-only';
import { ApiError } from '@/lib/errors';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { assertAdminCanModifyTarget, type ProfileStatus } from './admin-edit-helpers';
import {
  executeRoleMetadataResync,
  isRoleMetadataResyncSourceSafe,
  type RoleMetadataClaims,
} from './admin-role-transition';
import type { Role } from '@/lib/auth/roles';

type Caller = { id: string; role: Role; tenantId: string | null };

export async function resyncUserRoleMetadata(caller: Caller, targetUserId: string): Promise<void> {
  if (caller.role !== 'super_admin' && caller.role !== 'admin') {
    throw new ApiError('FORBIDDEN', 'Platform administrator access required', 403);
  }
  if (caller.id === targetUserId) {
    throw new ApiError('SELF_DEMOTION', 'You cannot resynchronize your own role metadata', 403);
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status')
    .eq('id', targetUserId)
    .maybeSingle();
  if (profileError) {
    console.error('role metadata resync profile read failed', profileError);
    throw new ApiError('ROLE_METADATA_RESYNC_FAILED', 'Could not load current authorization', 502);
  }
  if (!profile) throw new ApiError('NOT_FOUND', 'User not found', 404);

  assertAdminCanModifyTarget(
    { role: caller.role, tenantId: caller.tenantId },
    { role: profile.role as Role, tenantId: profile.tenant_id as string | null },
  );

  const { data: authUser, error: authReadError } = await admin.auth.admin.getUserById(targetUserId);
  if (authReadError || !authUser.user) {
    console.error('role metadata resync auth user read failed', authReadError);
    throw new ApiError('ROLE_METADATA_RESYNC_FAILED', 'Could not load auth authorization', 502);
  }

  const currentClaims: RoleMetadataClaims = {
    mandoob_role: profile.role as Role,
    tenant_id: profile.tenant_id as string | null,
    mandoob_status: profile.status as ProfileStatus,
    mandoob_role_transition: null,
  };
  if (!isRoleMetadataResyncSourceSafe(authUser.user.app_metadata, currentClaims)) {
    throw new ApiError(
      'ROLE_METADATA_STATE_CONFLICT',
      'Auth authorization is neither pending nor current; investigate before resynchronizing',
      409,
    );
  }

  await executeRoleMetadataResync({
    currentClaims,
    revoke: () => revokeAllSessions(targetUserId),
    writeMetadata: async (claims) => {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        app_metadata: claims,
      });
      if (error) throw error;
    },
    reportFailure: (stage, error) => console.error(`admin role metadata resync ${stage}`, error),
  });

  const { error: auditError } = await admin.from('admin_audit_actions').insert({
    actor_id: caller.id,
    action: 'change_role',
    target_profile_id: targetUserId,
    reason: 'Authorization metadata resynchronized from current profile',
  });
  if (auditError) console.error('admin role metadata resync audit failed', auditError);
}
