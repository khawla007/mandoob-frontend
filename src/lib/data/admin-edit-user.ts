import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { encryptOptional } from '@/lib/crypto/pii';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import type { EditUserOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';

type Caller = { id: string; role: Role; tenantId: string | null };

export type AdminEditUserResult = {
  changedKeys: string[];
};

/**
 * PATCH /api/v1/admin/users/[id] orchestrator. Mutates the profile row + the
 * matching role sub-row. Does NOT change role, status, or MFA — those have
 * dedicated routes. Audit goes to `auth_events(kind='admin_user_edited')`,
 * not `admin_audit_actions` (lifecycle changes only).
 */
export async function adminEditUser(
  targetId: string,
  input: EditUserOutput,
  ctx: { caller: Caller; ip: string; userAgent: string | null },
): Promise<AdminEditUserResult> {
  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id, full_name, phone')
    .eq('id', targetId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'User not found', 404);

  if (existing.role !== input.role) {
    throw new ApiError('INVALID_ROLE_TRANSITION', 'PATCH cannot change role; use POST /role', 400);
  }

  // admin caller scoping
  if (ctx.caller.role === 'admin') {
    if (existing.role === 'admin' || existing.role === 'super_admin') {
      throw new ApiError('FORBIDDEN', 'Admin cannot edit this user', 403);
    }
    if (existing.tenant_id !== ctx.caller.tenantId) {
      throw new ApiError('FORBIDDEN', 'User belongs to a different tenant', 403);
    }
  }

  const changedKeys: string[] = [];
  const profileUpdate: Record<string, unknown> = {};
  if (input.full_name !== existing.full_name) {
    profileUpdate.full_name = input.full_name;
    changedKeys.push('full_name');
  }
  if (input.phone !== existing.phone) {
    profileUpdate.phone = input.phone;
    changedKeys.push('phone');
  }
  // tenant_id immutable here. Ignore differences.

  if (Object.keys(profileUpdate).length) {
    const { error } = await admin.from('profiles').update(profileUpdate).eq('id', targetId);
    if (error) {
      throw new ApiError('VALIDATION_FAILED', `profiles update: ${error.message}`, 500);
    }
  }

  // Role-specific sub-row
  if (input.role === 'pro') {
    const update = {
      license_no_encrypted: encryptOptional(input.license_no),
      designation: input.designation ?? null,
      department: input.department ?? null,
      service_areas: input.service_areas,
      bio: input.bio ?? null,
    };
    const { error } = await admin.from('pro_profiles').update(update).eq('profile_id', targetId);
    if (error)
      throw new ApiError('VALIDATION_FAILED', `pro_profiles update: ${error.message}`, 500);
    changedKeys.push('pro_profile');
  } else if (input.role === 'customer') {
    const update = {
      nationality: input.nationality ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      linked_client_id: input.linked_client_id ?? null,
    };
    const { error } = await admin
      .from('customer_profiles')
      .update(update)
      .eq('profile_id', targetId);
    if (error)
      throw new ApiError('VALIDATION_FAILED', `customer_profiles update: ${error.message}`, 500);
    changedKeys.push('customer_profile');
  } else if (input.role === 'employee') {
    const update = {
      client_id: input.client_id,
      name: input.full_name,
      phone: input.phone,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      visa_no_encrypted: encryptOptional(input.visa_no ?? null),
      visa_expiry: input.visa_expiry ?? null,
      emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      eid_expiry: input.eid_expiry ?? null,
    };
    const { error } = await admin.from('employees').update(update).eq('profile_id', targetId);
    if (error) throw new ApiError('VALIDATION_FAILED', `employees update: ${error.message}`, 500);
    changedKeys.push('employee');
  }
  // role === 'admin' has no sub-row

  await recordAuthEvent({
    kind: 'admin_user_edited',
    actorUserId: ctx.caller.id,
    tenantId: existing.tenant_id as string | null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { target_id: targetId, changed_keys: changedKeys },
  }).catch((err) => console.error('recordAuthEvent failed', err));

  return { changedKeys };
}
