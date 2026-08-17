import 'server-only';
import { ApiError } from '@/lib/errors';
import type { Role } from '@/lib/auth/roles';

export type ProfileStatus = 'active' | 'invited' | 'disabled' | 'suspended';

/**
 * D3 status transition matrix. Reject anything not on this list.
 *   active → suspended (reason required, validated by Zod)
 *   active → disabled
 *   suspended → active (clears reason)
 *   suspended → disabled
 *   invited → disabled (cancel pending invite)
 * Same-status transitions and reactivation from disabled are out of scope.
 */
const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [ProfileStatus, ProfileStatus]> = [
  ['active', 'suspended'],
  ['active', 'disabled'],
  ['suspended', 'active'],
  ['suspended', 'disabled'],
  ['invited', 'disabled'],
];

export function assertStatusTransition(from: ProfileStatus, to: ProfileStatus): void {
  if (!ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to)) {
    throw new ApiError('INVALID_STATUS_TRANSITION', `Cannot transition from ${from} to ${to}`, 400);
  }
}

export function statusRequiresSessionRevoke(to: ProfileStatus): boolean {
  return to === 'suspended' || to === 'disabled';
}

/**
 * Admin and super_admin share production business permissions. The
 * development-only super_admin identity itself remains protected.
 * Throws ApiError; pure logic — no DB calls.
 */
export function assertAdminCanModifyTarget(
  caller: { role: Role; tenantId: string | null },
  target: { role: Role; tenantId: string | null },
): void {
  if (caller.role !== 'admin') return;
  if (target.role === 'super_admin') {
    throw new ApiError('FORBIDDEN', 'Admin cannot modify this user', 403);
  }
}

/**
 * D2a/b/c + protected development super_admin + blocked super_admin promotion
 * + role-semantics rebase tenant coupling. Pure logic —
 * does not query the DB. The caller is responsible for the count query
 * feeding `remainingSuperAdmins` (D2b).
 *
 * Role/tenantId coupling enforced (post role-rebase):
 *   - super_admin → newTenantId MUST be null
 *   - admin       → newTenantId MUST be null
 *   - pro         → newTenantId MUST be null until company assignment
 *   - customer    → newTenantId required (non-null UUID)
 *   - employee    → newTenantId required (non-null UUID)
 */
export type RoleChangeGuardArgs = {
  callerId: string;
  callerRole: Role;
  targetId: string;
  targetRole: Role;
  newRole: Role;
  newTenantId: string | null;
  confirmation?: string;
  remainingSuperAdminsExcludingTarget: number;
};

export function assertRoleChangeAllowed(args: RoleChangeGuardArgs): void {
  // D2a — cannot self-modify
  if (args.callerId === args.targetId) {
    throw new ApiError('SELF_DEMOTION', 'You cannot change your own role', 403);
  }

  // No-op transitions are not allowed (use PATCH for field edits)
  if (args.targetRole === args.newRole) {
    throw new ApiError('INVALID_ROLE_TRANSITION', 'New role must differ from current role', 400);
  }

  // Promotion to super_admin via UI is blocked. super_admin provisioning
  // is a manual SQL operation per migration 0014.
  if ((args.newRole as string) === 'super_admin') {
    throw new ApiError(
      'INVALID_ROLE_TRANSITION',
      'Promotion to super_admin is not allowed from this UI',
      400,
    );
  }

  // The development-only super_admin identity is not business-manageable.
  if (args.callerRole === 'admin' && args.targetRole === 'super_admin') {
    throw new ApiError('FORBIDDEN', 'Super admin identities cannot be changed by an admin', 403);
  }

  // Role/tenant coupling (post role-semantics rebase). Platform roles and an
  // unassigned PRO have no tenant; customer and employee remain tenant-scoped.
  const platformScoped =
    args.newRole === 'super_admin' || args.newRole === 'admin' || args.newRole === 'pro';
  if (platformScoped && args.newTenantId !== null) {
    throw new ApiError(
      'INVALID_TENANT_ASSIGNMENT',
      `Role ${args.newRole} must not have a tenant assignment`,
      400,
    );
  }
  if (!platformScoped && args.newTenantId === null) {
    throw new ApiError(
      'INVALID_TENANT_ASSIGNMENT',
      `Role ${args.newRole} requires a tenant assignment`,
      400,
    );
  }

  // D2c — demoting any super_admin requires explicit confirmation
  if (args.targetRole === 'super_admin') {
    if (args.confirmation !== 'DEMOTE') {
      throw new ApiError(
        'CONFIRMATION_REQUIRED',
        'Type DEMOTE to confirm super_admin demotion',
        400,
      );
    }
    // D2b — count check excludes the target itself
    if (args.remainingSuperAdminsExcludingTarget < 1) {
      throw new ApiError('LAST_SUPER_ADMIN', 'Cannot demote the last remaining super_admin', 409);
    }
  }
}
