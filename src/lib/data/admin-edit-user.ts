import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { decryptOptional, encryptOptional } from '@/lib/crypto/pii';
import { hashPassportForLookup } from '@/lib/crypto/passport-lookup';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import type { EditUserOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';
import { assertAdminCanModifyTarget } from './admin-edit-helpers';

type Caller = { id: string; role: Role; tenantId: string | null };

export type AdminEditUserResult = {
  changedKeys: string[];
};

export function proLicenseChanged(current: string | null, next: string | null): boolean {
  return (current?.trim() || null) !== (next?.trim() || null);
}

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
  if (readErr) {
    console.error('admin edit profile read failed', readErr);
    throw new ApiError('INTERNAL', 'Could not load user', 500);
  }
  if (!existing) throw new ApiError('NOT_FOUND', 'User not found', 404);

  if (existing.role !== input.role) {
    throw new ApiError('INVALID_ROLE_TRANSITION', 'PATCH cannot change role; use POST /role', 400);
  }

  assertAdminCanModifyTarget(
    { role: ctx.caller.role, tenantId: ctx.caller.tenantId },
    { role: existing.role as Role, tenantId: existing.tenant_id as string | null },
  );

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
      console.error('admin edit profile update failed', error);
      throw new ApiError('INTERNAL', 'Could not update user', 500);
    }
  }

  // Role-specific sub-row
  if (input.role === 'pro') {
    const { data: currentPro, error: currentProError } = await admin
      .from('pro_profiles')
      .select('license_no_encrypted')
      .eq('profile_id', targetId)
      .maybeSingle();
    if (currentProError || !currentPro) {
      throw new ApiError('INTERNAL', 'Could not read PRO profile', 500);
    }
    const licenseChanged = proLicenseChanged(
      decryptOptional(currentPro.license_no_encrypted),
      input.license_no,
    );
    const update: Record<string, unknown> = {
      license_no_encrypted: encryptOptional(input.license_no),
      designation: input.designation ?? null,
      department: input.department ?? null,
      service_areas: input.service_areas,
      bio: input.bio ?? null,
    };
    if (licenseChanged) {
      update.credentials_verified = false;
      update.verified_at = null;
      update.verified_by_profile_id = null;
    }
    const { error } = await admin.from('pro_profiles').update(update).eq('profile_id', targetId);
    if (error) {
      console.error('admin edit PRO update failed', error);
      throw new ApiError('INTERNAL', 'Could not update user', 500);
    }
    changedKeys.push('pro_profile');
  } else if (input.role === 'customer') {
    const update = {
      nationality: input.nationality ?? null,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      linked_company_id: input.linked_company_id ?? null,
    };
    const { error } = await admin
      .from('customer_profiles')
      .update(update)
      .eq('profile_id', targetId);
    if (error) {
      console.error('admin edit customer update failed', error);
      throw new ApiError('INTERNAL', 'Could not update user', 500);
    }
    changedKeys.push('customer_profile');
  } else if (input.role === 'employee') {
    const update = {
      company_id: input.company_id,
      name: input.full_name,
      phone: input.phone,
      passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      passport_no_hash: hashPassportForLookup(input.company_id, input.passport_no),
      visa_no_encrypted: encryptOptional(input.visa_no ?? null),
      visa_expiry: input.visa_expiry ?? null,
      emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      eid_expiry: input.eid_expiry ?? null,
    };
    const { error } = await admin.from('employees').update(update).eq('profile_id', targetId);
    if (error) {
      if (error.code === '23505') {
        console.error('admin-edit-user.employee-passport duplicate');
        throw new ApiError('PASSPORT_DUPLICATE', 'Passport already belongs to this company', 409);
      }
      console.error('admin edit employee update failed', error);
      throw new ApiError('INTERNAL', 'Could not update user', 500);
    }
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
