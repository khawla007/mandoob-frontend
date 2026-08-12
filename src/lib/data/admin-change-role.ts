import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { encryptOptional } from '@/lib/crypto/pii';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import { assertRoleChangeAllowed, assertAdminCanModifyTarget } from './admin-edit-helpers';
import type { ChangeRoleOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';

type Caller = { id: string; role: Role; tenantId: string | null };

export async function adminChangeRole(
  targetId: string,
  input: ChangeRoleOutput,
  ctx: { caller: Caller; ip: string; userAgent: string | null },
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status, full_name, phone')
    .eq('id', targetId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'User not found', 404);

  // Scope against the EXISTING tenant — never the new tenant in the body —
  // otherwise an admin from tenant A could mutate a user in tenant B by
  // picking A as the new tenant.
  assertAdminCanModifyTarget(
    { role: ctx.caller.role, tenantId: ctx.caller.tenantId },
    { role: existing.role as Role, tenantId: existing.tenant_id as string | null },
  );

  // D2b — count remaining super_admins excluding the target. Skip the query
  // if target is not a super_admin.
  let remainingSuperAdmins = Number.MAX_SAFE_INTEGER;
  if (existing.role === 'super_admin') {
    const { count, error: countErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .neq('id', targetId);
    if (countErr) throw new ApiError('INTERNAL', countErr.message, 500);
    remainingSuperAdmins = count ?? 0;
  }

  // Tenant scope for non-admin newRole. admin caller must keep its own tenant.
  const newTenantId = input.newRole === 'admin' ? null : input.tenant_id;

  assertRoleChangeAllowed({
    callerId: ctx.caller.id,
    callerRole: ctx.caller.role,
    targetId,
    targetRole: existing.role as Role,
    newRole: input.newRole,
    newTenantId,
    confirmation: input.confirmation,
    remainingSuperAdminsExcludingTarget: remainingSuperAdmins,
  });

  const oldRole = existing.role as Role;
  let roleData: Record<string, unknown> = {};
  if (input.newRole === 'pro') {
    roleData = {
      license_no_encrypted: encryptOptional(input.license_no),
      designation: input.designation ?? null,
      department: input.department ?? null,
      service_areas: input.service_areas,
      bio: input.bio ?? null,
    };
  } else if (input.newRole === 'customer') {
    roleData = {
      nationality: input.nationality ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      linked_client_id: input.linked_client_id ?? null,
    };
  } else if (input.newRole === 'employee') {
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    roleData = {
      client_id: input.client_id,
      name: (existing.full_name as string | null) ?? authUser?.user?.email ?? 'Unnamed',
      email: authUser?.user?.email ?? null,
      phone: (existing.phone as string | null) ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      visa_no_encrypted: encryptOptional(input.visa_no ?? null),
      visa_expiry: input.visa_expiry ?? null,
      emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      eid_expiry: input.eid_expiry ?? null,
    };
  }

  // Revocation is the fail-closed precondition for changing authorization state. Existing access
  // tokens can remain valid until their short JWT expiry, but no refresh token may survive the
  // role transition. If GoTrue cannot revoke the sessions, leave the database and metadata alone.
  try {
    await revokeAllSessions(targetId);
  } catch (err) {
    console.error('revokeAllSessions failed before atomic role change', err);
    throw new ApiError('SESSION_REVOKE_FAILED', 'Could not revoke user sessions', 502);
  }

  const { error: roleChangeError } = await admin.rpc('admin_change_role_atomic', {
    p_target_id: targetId,
    p_actor_id: ctx.caller.id,
    p_expected_role: oldRole,
    p_expected_tenant_id: existing.tenant_id as string | null,
    p_new_role: input.newRole,
    p_new_tenant_id: newTenantId,
    p_role_data: roleData,
    p_reason: input.reason ?? null,
  });
  if (roleChangeError) {
    console.error('admin_change_role_atomic failed after session revocation', roleChangeError);
    const changedDuringRequest = roleChangeError.message.includes('PROFILE_CHANGED_RETRY');
    const forbiddenTenantMove = roleChangeError.message.includes(
      'PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES',
    );
    const clientTenantMismatch = /(?:EMPLOYEE|CUSTOMER)_CLIENT_TENANT_MISMATCH/.test(
      roleChangeError.message,
    );
    throw new ApiError(
      forbiddenTenantMove
        ? 'INVALID_TENANT_ASSIGNMENT'
        : changedDuringRequest
          ? 'INVALID_ROLE_TRANSITION'
          : clientTenantMismatch
            ? 'FORBIDDEN'
            : 'VALIDATION_FAILED',
      forbiddenTenantMove
        ? 'Profile tenant cannot change while service-case history references it'
        : changedDuringRequest
          ? 'Profile changed during role update; retry with fresh data'
          : clientTenantMismatch
            ? 'Client does not belong to selected tenant'
            : 'Role change could not be completed',
      forbiddenTenantMove || changedDuringRequest ? 409 : clientTenantMismatch ? 403 : 500,
    );
  }

  // Do not create privileged metadata before the database transition succeeds. Sessions were
  // already revoked, so a metadata failure leaves a coherent database without a stale old session.
  const { error: authUpdErr } = await admin.auth.admin.updateUserById(targetId, {
    app_metadata: {
      mandoob_role: input.newRole,
      tenant_id: newTenantId,
    },
  });
  if (authUpdErr) {
    console.error('auth metadata update failed after atomic role change', authUpdErr);
    throw new ApiError(
      'AUTH_METADATA_SYNC_FAILED',
      'Could not synchronize user auth metadata',
      502,
    );
  }

  await recordAuthEvent({
    kind: 'admin_user_role_changed',
    actorUserId: ctx.caller.id,
    tenantId: newTenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      target_id: targetId,
      from_role: oldRole,
      to_role: input.newRole,
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));
}
