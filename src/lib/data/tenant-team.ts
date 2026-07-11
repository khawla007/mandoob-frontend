import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { adminCreateUser } from '@/lib/data/admin-create-user';
import { promoteToTenantAdmin } from '@/lib/data/promote-to-tenant-admin';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import {
  assertLastAdminInvariant,
  countActiveAdminsExcluding,
} from '@/lib/data/tenant-admin-invariants';
import type { Role } from '@/lib/auth/roles';
import type {
  InviteColleagueInput,
  ChangeMemberRoleInput,
  SetMemberStatusInput,
  ResendInviteInput,
} from '@/lib/validation/tenant-team';

type Caller = { id: string; role: Role; tenantId: string | null };
type Ctx = {
  caller: Caller;
  ip: string;
  userAgent: string | null;
  tenantId: string;
};

async function logAudit(tenantId: string, actorId: string, details: Record<string, unknown>) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action: 'updated',
    source: 'self_serve',
    details,
  });
  if (error) console.error('tenant_audit_log insert failed', error);
}

export async function inviteColleague(
  input: InviteColleagueInput,
  ctx: Ctx,
): Promise<{ userId: string }> {
  // adminCreateUser blocks non-super_admin from creating an admin directly,
  // so always create as 'pro' first; if the inviter chose 'admin', promote
  // afterwards.
  const created = await adminCreateUser(
    {
      role: 'pro',
      tenant_id: ctx.tenantId,
      full_name: input.full_name,
      email: input.email,
      // Phone is required by createUserSchema; the invitee fills it in via
      // /account on first sign-in. Same placeholder convention as license_no.
      phone: '+971500000000',
      license_no: 'PENDING_ONBOARDING',
      service_areas: [],
      designation: null,
      department: null,
      bio: null,
    },
    { caller: ctx.caller, ip: ctx.ip, userAgent: ctx.userAgent },
  );

  if (input.role === 'admin') {
    await promoteToTenantAdmin(created.userId, ctx.tenantId);
  }

  await logAudit(ctx.tenantId, ctx.caller.id, {
    entity: 'profile',
    op: 'invite',
    target_id: created.userId,
    target_role: input.role,
  });
  await recordAuthEvent({
    kind: 'invite_created',
    actorUserId: ctx.caller.id,
    tenantId: ctx.tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      target_id: created.userId,
      target_role: input.role,
      source: 'tenant_team',
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));

  return { userId: created.userId };
}

export async function changeMemberRole(input: ChangeMemberRoleInput, ctx: Ctx): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data: target, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status')
    .eq('id', input.target_id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!target) throw new ApiError('NOT_FOUND', 'member not found', 404);
  if (target.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'member belongs to a different tenant', 403);
  }
  if (target.role !== 'pro' && target.role !== 'admin') {
    throw new ApiError('FORBIDDEN', 'cannot change role of non-tenant member', 403);
  }
  if (target.role === input.new_role) {
    throw new ApiError('INVALID_ROLE_TRANSITION', 'role unchanged', 400);
  }

  if (target.role === 'admin' && input.new_role === 'pro') {
    const remaining = await countActiveAdminsExcluding(ctx.tenantId, target.id as string);
    assertLastAdminInvariant({
      remainingActiveAdminsExcludingTarget: remaining,
      targetWillBeActiveAdminAfter: false,
    });
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({ role: input.new_role, updated_at: new Date().toISOString() })
    .eq('id', target.id as string);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  const { error: authUpdErr } = await admin.auth.admin.updateUserById(target.id as string, {
    app_metadata: { mandoob_role: input.new_role, tenant_id: ctx.tenantId },
  });
  if (authUpdErr) {
    throw new ApiError('INTERNAL', `auth metadata update: ${authUpdErr.message}`, 500);
  }

  await logAudit(ctx.tenantId, ctx.caller.id, {
    entity: 'profile',
    op: 'change_role',
    target_id: target.id,
    from_role: target.role,
    to_role: input.new_role,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: ctx.caller.id,
    tenantId: ctx.tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { entity: 'profile', op: 'change_role', target_id: target.id },
  }).catch((err) => console.error('recordAuthEvent failed', err));
}

export async function setMemberStatus(input: SetMemberStatusInput, ctx: Ctx): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data: target, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status')
    .eq('id', input.target_id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!target) throw new ApiError('NOT_FOUND', 'member not found', 404);
  if (target.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'member belongs to a different tenant', 403);
  }
  if (target.role !== 'pro' && target.role !== 'admin') {
    throw new ApiError('FORBIDDEN', 'cannot change status of non-tenant member', 403);
  }
  if (input.new_status === 'suspended' && (target.id as string) === ctx.caller.id) {
    throw new ApiError('FORBIDDEN', 'cannot suspend yourself', 403);
  }

  if (target.role === 'admin' && input.new_status === 'suspended' && target.status === 'active') {
    const remaining = await countActiveAdminsExcluding(ctx.tenantId, target.id as string);
    assertLastAdminInvariant({
      remainingActiveAdminsExcludingTarget: remaining,
      targetWillBeActiveAdminAfter: false,
    });
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({ status: input.new_status, updated_at: new Date().toISOString() })
    .eq('id', target.id as string);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  if (input.new_status === 'suspended') {
    try {
      await revokeAllSessions(target.id as string);
    } catch (err) {
      console.error('revokeAllSessions failed', err);
    }
  }

  await logAudit(ctx.tenantId, ctx.caller.id, {
    entity: 'profile',
    op: 'set_status',
    target_id: target.id,
    new_status: input.new_status,
    reason: input.reason ?? null,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: ctx.caller.id,
    tenantId: ctx.tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      entity: 'profile',
      op: 'set_status',
      target_id: target.id,
      new_status: input.new_status,
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));
}

export async function resendMemberInvite(input: ResendInviteInput, ctx: Ctx): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data: target, error: readErr } = await admin
    .from('profiles')
    .select('id, tenant_id, status')
    .eq('id', input.target_id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!target) throw new ApiError('NOT_FOUND', 'member not found', 404);
  if (target.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'member belongs to a different tenant', 403);
  }
  if (target.status !== 'invited') {
    throw new ApiError('INVALID_STATE', 'member has already accepted their invite', 400);
  }

  const { data: authUser } = await admin.auth.admin.getUserById(target.id as string);
  const email = authUser?.user?.email;
  if (!email) throw new ApiError('NOT_FOUND', 'auth user has no email', 404);

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr) {
    throw new ApiError('INVITE_FAILED', inviteErr.message, 502);
  }

  await logAudit(ctx.tenantId, ctx.caller.id, {
    entity: 'profile',
    op: 'resend_invite',
    target_id: target.id,
  });
}
