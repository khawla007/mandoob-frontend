'use server';

import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { revokeSessionById } from '@/lib/auth/sessions';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveProfilesByIds } from '@/lib/data/profile-lookups';
import { revokeSessionInput, revokeAllInput, unlockKeyInput } from '@/lib/validation/observability';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function getCallerContext() {
  const session = await requireRole('super_admin');
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return {
    caller: { id: session.id, role: session.role!, tenantId: session.tenantId ?? null },
    ip,
    userAgent,
  };
}

async function auditTenantSessionRevoke(
  callerId: string,
  targetUserId: string,
  scope: 'one' | 'all',
  sessionId?: string,
) {
  const admin = createSupabaseServiceRoleClient();
  const profiles = await resolveProfilesByIds([targetUserId]);
  const tenantId = profiles.get(targetUserId)?.tenantId ?? null;
  if (tenantId) {
    const targetOpaqueId = createHash('sha256').update(targetUserId).digest('hex');
    const sessionOpaqueId = sessionId ? createHash('sha256').update(sessionId).digest('hex') : null;
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: callerId,
      action: 'session_revoked',
      source: 'admin',
      details: { target_opaque_id: targetOpaqueId, scope, session_opaque_id: sessionOpaqueId },
    });
  }
  return tenantId;
}

async function auditPlatformSessionRevoke(args: {
  actorId: string;
  targetUserId: string;
  tenantId: string | null;
  scope: 'one' | 'all';
  operationId: string;
}) {
  const target = createHash('sha256').update(args.targetUserId).digest('hex');
  const { error } = await createSupabaseServiceRoleClient().rpc(
    'append_platform_audit_event' as never,
    {
      p_event_name: 'security.session.revoked',
      p_actor_id: args.actorId,
      p_tenant_id: args.tenantId,
      p_action: 'revoke_session',
      p_target_type: 'user',
      p_target_opaque_id: target,
      p_outcome: 'success',
      p_reason_code: args.scope === 'one' ? 'SESSION_REVOKED' : 'ALL_SESSIONS_REVOKED',
      p_operation_id: args.operationId,
      p_correlation_id: randomUUID(),
      p_source_class: 'admin',
      p_safe_metadata: { scope: args.scope },
    } as never,
  );
  if (error) throw new ApiError('AUDIT_FAILED', 'Could not record required audit event', 503);
}

export async function revokeSessionAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = revokeSessionInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    if (parsed.data.userId === ctx.caller.id) {
      return { ok: false, error: 'Cannot revoke your own session', code: 'SELF_REVOKE_BLOCKED' };
    }
    await revokeSessionById(parsed.data.userId, parsed.data.sessionId);
    const tenantId = await auditTenantSessionRevoke(
      ctx.caller.id,
      parsed.data.userId,
      'one',
      parsed.data.sessionId,
    );
    await auditPlatformSessionRevoke({
      actorId: ctx.caller.id,
      targetUserId: parsed.data.userId,
      tenantId,
      scope: 'one',
      operationId: parsed.data.operationId,
    });
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: {
        target_opaque_id: createHash('sha256').update(parsed.data.userId).digest('hex'),
        session_opaque_id: createHash('sha256').update(parsed.data.sessionId).digest('hex'),
      },
    }).catch((err) => console.error('recordAuthEvent failed', err));
    revalidatePath('/admin/sessions');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('revokeSessionAction unexpected error', e);
    return { ok: false, error: 'Could not revoke session', code: 'INTERNAL' };
  }
}

export async function revokeAllSessionsForUserAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = revokeAllInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    if (parsed.data.userId === ctx.caller.id) {
      return { ok: false, error: 'Cannot revoke your own sessions', code: 'SELF_REVOKE_BLOCKED' };
    }
    await revokeAllSessions(parsed.data.userId);
    const tenantId = await auditTenantSessionRevoke(ctx.caller.id, parsed.data.userId, 'all');
    await auditPlatformSessionRevoke({
      actorId: ctx.caller.id,
      targetUserId: parsed.data.userId,
      tenantId,
      scope: 'all',
      operationId: parsed.data.operationId,
    });
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: {
        target_opaque_id: createHash('sha256').update(parsed.data.userId).digest('hex'),
        scope: 'all',
      },
    }).catch((err) => console.error('recordAuthEvent failed', err));
    revalidatePath('/admin/sessions');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('revokeAllSessionsForUserAction unexpected error', e);
    return { ok: false, error: 'Could not revoke sessions', code: 'INTERNAL' };
  }
}

export async function unlockAccountAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = unlockKeyInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const ctx = await getCallerContext();
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.rpc(
      'unlock_account_with_platform_audit' as never,
      {
        p_actor_id: ctx.caller.id,
        p_key: parsed.data.key,
        p_operation_id: parsed.data.operationId,
        p_correlation_id: randomUUID(),
      } as never,
    );
    if (error) {
      console.error('unlockAccountAction update failed', error);
      return { ok: false, error: 'Could not unlock account', code: 'INTERNAL' };
    }
    revalidatePath('/admin/security');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('unlockAccountAction unexpected error', e);
    return { ok: false, error: 'Could not unlock account', code: 'INTERNAL' };
  }
}
