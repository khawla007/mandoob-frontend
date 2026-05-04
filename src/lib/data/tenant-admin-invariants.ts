import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Pure invariant: a tenant must always end up with at least one active admin.
 * Throws ApiError('LAST_ADMIN_GUARD', ...) when the requested op would
 * remove the last active admin.
 *
 * The caller passes the count of active admins in the tenant excluding
 * the target. If after the op the target would no longer be an active
 * admin, the count must remain >= 1.
 */
export function assertLastAdminInvariant(args: {
  remainingActiveAdminsExcludingTarget: number;
  targetWillBeActiveAdminAfter: boolean;
}): void {
  if (args.targetWillBeActiveAdminAfter) return;
  if (args.remainingActiveAdminsExcludingTarget >= 1) return;
  throw new ApiError(
    'LAST_ADMIN_GUARD',
    'A tenant must always have at least one active admin. Promote another member to admin first.',
    400,
  );
}

export async function countActiveAdminsExcluding(
  tenantId: string,
  excludeId: string,
): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .neq('id', excludeId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return count ?? 0;
}
