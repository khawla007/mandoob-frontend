import type { SessionProfile } from './require-user';
import type { Role } from './roles';
import { isUuid } from '@/lib/util/uuid';

type InviteRole = Extract<Role, 'pro' | 'customer' | 'employee'>;

export function resolveInviteTenant(
  actor: SessionProfile,
  requestedTenantId: string | null,
  inviteRole: InviteRole,
): string | null {
  if (actor.aal !== 'aal2' || !actor.mfaEnrolled) return null;
  if (actor.role === 'pro') {
    if (!actor.tenantId || !isUuid(actor.tenantId) || inviteRole === 'pro') return null;
    if (requestedTenantId !== null && requestedTenantId !== actor.tenantId) return null;
    return actor.tenantId;
  }
  if (actor.role === 'admin' || actor.role === 'super_admin') {
    if (actor.tenantId !== null || !requestedTenantId || !isUuid(requestedTenantId)) return null;
    return requestedTenantId;
  }
  return null;
}
