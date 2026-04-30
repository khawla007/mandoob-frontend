import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import type { MfaResetOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';

type Caller = { id: string; role: Role; tenantId: string | null };

export type AdminResetMfaResult = {
  factorsRemoved: number;
};

export async function adminResetMfa(
  targetId: string,
  input: MfaResetOutput,
  ctx: { caller: Caller; ip: string; userAgent: string | null },
): Promise<AdminResetMfaResult> {
  const admin = createSupabaseServiceRoleClient();

  if (ctx.caller.id === targetId) {
    throw new ApiError('FORBIDDEN', 'Use the MFA settings page to reset your own MFA', 403);
  }

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('id', targetId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'User not found', 404);

  if (ctx.caller.role === 'admin') {
    if (existing.role === 'admin' || existing.role === 'super_admin') {
      throw new ApiError('FORBIDDEN', 'Admin cannot reset MFA for this user', 403);
    }
    if (existing.tenant_id !== ctx.caller.tenantId) {
      throw new ApiError('FORBIDDEN', 'User belongs to a different tenant', 403);
    }
  }

  // Pull factors. Supabase admin API exposes mfa.listFactors and
  // mfa.deleteFactor at the user-id-keyed endpoints.
  const { data: factorsData, error: factorsErr } = await admin.auth.admin.mfa.listFactors({
    userId: targetId,
  });
  if (factorsErr) {
    throw new ApiError('MFA_RESET_FAILED', factorsErr.message, 502);
  }
  const factors = factorsData?.factors ?? [];

  for (const factor of factors) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
      userId: targetId,
      id: factor.id,
    });
    if (delErr) {
      throw new ApiError('MFA_RESET_FAILED', `deleteFactor ${factor.id}: ${delErr.message}`, 502);
    }
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({ mfa_enrolled_at: null })
    .eq('id', targetId);
  if (profileErr) {
    throw new ApiError('VALIDATION_FAILED', `profiles update: ${profileErr.message}`, 500);
  }

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

  const { error: auditErr } = await admin.from('admin_audit_actions').insert({
    actor_id: ctx.caller.id,
    action: 'reset_mfa',
    target_profile_id: targetId,
    reason: input.reason ?? null,
  });
  if (auditErr) console.error('admin_audit_actions insert failed', auditErr);

  await recordAuthEvent({
    kind: 'mfa_reset',
    actorUserId: ctx.caller.id,
    tenantId: existing.tenant_id as string | null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { target_id: targetId, factors_removed: factors.length },
  }).catch((err) => console.error('recordAuthEvent failed', err));

  return { factorsRemoved: factors.length };
}
