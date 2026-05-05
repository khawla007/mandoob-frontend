'use server';

import 'server-only';
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

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

async function resolveTenantFromLockoutKey(
  admin: ServiceClient,
  key: string,
): Promise<{ userId: string | null; tenantId: string | null }> {
  if (!key.toLowerCase().startsWith('acct:')) return { userId: null, tenantId: null };
  const email = key.slice(5).toLowerCase();
  const { data: page, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !page) {
    console.error('resolveTenantFromLockoutKey listUsers failed', error);
    return { userId: null, tenantId: null };
  }
  const match = page.users.find((u) => (u.email ?? '').toLowerCase() === email);
  if (!match) return { userId: null, tenantId: null };
  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', match.id)
    .maybeSingle();
  const tenantId = (profile as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return { userId: match.id, tenantId };
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
    await admin.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      actor_id: callerId,
      action: 'session_revoked',
      source: 'admin',
      details: { target_user_id: targetUserId, scope, session_id: sessionId ?? null },
    });
  }
  return tenantId;
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
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { target_user_id: parsed.data.userId, session_id: parsed.data.sessionId },
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
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: ctx.caller.id,
      tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { target_user_id: parsed.data.userId, scope: 'all' },
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
    const { error } = await admin
      .from('auth_failed_attempts')
      .update({ count: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq('key', parsed.data.key);
    if (error) {
      console.error('unlockAccountAction update failed', error);
      return { ok: false, error: 'Could not unlock account', code: 'INTERNAL' };
    }
    const resolved = await resolveTenantFromLockoutKey(admin, parsed.data.key);
    if (resolved.tenantId) {
      await admin.from('tenant_audit_log').insert({
        tenant_id: resolved.tenantId,
        actor_id: ctx.caller.id,
        action: 'unlocked',
        source: 'admin',
        details: { key: parsed.data.key, target_user_id: resolved.userId },
      });
    } else {
      console.info('unlockAccountAction: no tenant resolved, audit row skipped', {
        key: parsed.data.key,
      });
    }
    revalidatePath('/admin/security');
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('unlockAccountAction unexpected error', e);
    return { ok: false, error: 'Could not unlock account', code: 'INTERNAL' };
  }
}
