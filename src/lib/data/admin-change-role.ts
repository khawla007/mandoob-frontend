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
    .select('id, role, tenant_id, status')
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

  // Validate cross-tenant client_id for employee newRole.
  if (input.newRole === 'employee') {
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', input.client_id)
      .maybeSingle();
    if (clientErr) throw new ApiError('VALIDATION_FAILED', 'Client lookup failed', 400);
    if (!client) throw new ApiError('VALIDATION_FAILED', 'client not found', 400);
    if (client.tenant_id !== newTenantId) {
      throw new ApiError('FORBIDDEN', 'client does not belong to selected tenant', 403);
    }
  }
  if (input.newRole === 'customer' && input.linked_client_id) {
    const { data: linked } = await admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', input.linked_client_id)
      .maybeSingle();
    if (linked && linked.tenant_id !== newTenantId) {
      throw new ApiError('FORBIDDEN', 'linked client does not belong to selected tenant', 403);
    }
  }

  // D1 — revoke sessions first; failure aborts before any DB mutation.
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

  // Drop the old role's sub-row. Each table is keyed on profile_id and has
  // ON DELETE CASCADE from profiles, but we delete here explicitly so the
  // role swap can complete without dropping the profile row.
  const oldRole = existing.role as Role;
  if (oldRole === 'pro') {
    await admin.from('pro_profiles').delete().eq('profile_id', targetId);
  } else if (oldRole === 'customer') {
    await admin.from('customer_profiles').delete().eq('profile_id', targetId);
  } else if (oldRole === 'employee') {
    await admin.from('employees').delete().eq('profile_id', targetId);
  }

  // Insert the new role's sub-row.
  if (input.newRole === 'pro') {
    const { error } = await admin.from('pro_profiles').insert({
      profile_id: targetId,
      license_no_encrypted: encryptOptional(input.license_no),
      designation: input.designation ?? null,
      department: input.department ?? null,
      service_areas: input.service_areas,
      bio: input.bio ?? null,
    });
    if (error)
      throw new ApiError('VALIDATION_FAILED', `pro_profiles insert: ${error.message}`, 500);
  } else if (input.newRole === 'customer') {
    const { error } = await admin.from('customer_profiles').insert({
      profile_id: targetId,
      nationality: input.nationality ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      linked_client_id: input.linked_client_id ?? null,
    });
    if (error)
      throw new ApiError('VALIDATION_FAILED', `customer_profiles insert: ${error.message}`, 500);
  } else if (input.newRole === 'employee') {
    // Employees row needs name/email/phone replicated from the profile.
    const { data: prof } = await admin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', targetId)
      .maybeSingle();
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    const { error } = await admin.from('employees').insert({
      tenant_id: newTenantId as string,
      client_id: input.client_id,
      profile_id: targetId,
      name: (prof?.full_name as string | null) ?? authUser?.user?.email ?? 'Unnamed',
      email: authUser?.user?.email ?? null,
      phone: (prof?.phone as string | null) ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      visa_no_encrypted: encryptOptional(input.visa_no ?? null),
      visa_expiry: input.visa_expiry ?? null,
      emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      eid_expiry: input.eid_expiry ?? null,
      status: 'active',
    });
    if (error) throw new ApiError('VALIDATION_FAILED', `employees insert: ${error.message}`, 500);
  }
  // newRole === 'admin' — no sub-row.

  // Patch the profile row.
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      role: input.newRole,
      tenant_id: newTenantId,
    })
    .eq('id', targetId);
  if (updErr) {
    throw new ApiError('VALIDATION_FAILED', `profiles update: ${updErr.message}`, 500);
  }

  // Patch app_metadata so the next JWT carries the new claims.
  const { error: authUpdErr } = await admin.auth.admin.updateUserById(targetId, {
    app_metadata: {
      mandoob_role: input.newRole,
      tenant_id: newTenantId,
    },
  });
  if (authUpdErr) {
    throw new ApiError('INTERNAL', `auth metadata update: ${authUpdErr.message}`, 500);
  }

  // Audit
  const { error: auditErr } = await admin.from('admin_audit_actions').insert({
    actor_id: ctx.caller.id,
    action: 'change_role',
    target_profile_id: targetId,
    reason: input.reason ?? null,
  });
  if (auditErr) console.error('admin_audit_actions insert failed', auditErr);

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
