import { ApiError } from '@/lib/errors';

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
