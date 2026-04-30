import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import {
  assertStatusTransition,
  statusRequiresSessionRevoke,
  type ProfileStatus,
} from './admin-edit-helpers';
import type { ChangeStatusOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';

type Caller = { id: string; role: Role; tenantId: string | null };

export async function adminChangeStatus(
  targetId: string,
  input: ChangeStatusOutput,
  ctx: { caller: Caller; ip: string; userAgent: string | null },
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  if (ctx.caller.id === targetId) {
    throw new ApiError('SELF_DEMOTION', 'You cannot change your own status', 403);
  }

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, role, status, tenant_id')
    .eq('id', targetId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'User not found', 404);

  if (ctx.caller.role === 'admin') {
    if (existing.role === 'admin' || existing.role === 'super_admin') {
      throw new ApiError('FORBIDDEN', 'Admin cannot change this user’s status', 403);
    }
    if (existing.tenant_id !== ctx.caller.tenantId) {
      throw new ApiError('FORBIDDEN', 'User belongs to a different tenant', 403);
    }
  }

  const fromStatus = existing.status as ProfileStatus;
  const toStatus = input.newStatus;
  assertStatusTransition(fromStatus, toStatus);

  const reason =
    toStatus === 'suspended'
      ? input.reason
      : toStatus === 'disabled'
        ? (input.reason ?? null)
        : null;

  // Revoke first so a half-completed update never leaves the target with
  // both old privileges AND fresh sessions. If the DB write then fails, the
  // user can re-login but we have not granted false power.
  if (statusRequiresSessionRevoke(toStatus)) {
    try {
      await revokeAllSessions(targetId);
    } catch (err) {
      console.error('revokeAllSessions failed', err);
      throw new ApiError(
        'SESSION_REVOKE_FAILED',
        err instanceof Error ? err.message : 'Could not revoke sessions',
        502,
      );
    }
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({
      status: toStatus,
      suspension_reason: toStatus === 'suspended' ? reason : null,
    })
    .eq('id', targetId);
  if (updErr) {
    throw new ApiError('VALIDATION_FAILED', `profiles update: ${updErr.message}`, 500);
  }

  const { error: auditErr } = await admin.from('admin_audit_actions').insert({
    actor_id: ctx.caller.id,
    action: 'change_status',
    target_profile_id: targetId,
    reason: reason ?? null,
  });
  if (auditErr) console.error('admin_audit_actions insert failed', auditErr);

  await recordAuthEvent({
    kind: 'admin_user_status_changed',
    actorUserId: ctx.caller.id,
    tenantId: existing.tenant_id as string | null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      target_id: targetId,
      from_status: fromStatus,
      to_status: toStatus,
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));
}
