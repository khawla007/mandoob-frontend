import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { decryptOptional } from '@/lib/crypto/pii';
import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from './admin-edit-helpers';

type Caller = { id: string; role: Role; tenantId: string | null };

export type EditableProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Role;
  tenantId: string | null;
  status: ProfileStatus;
  suspensionReason: string | null;
  mfaEnrolledAt: string | null;
};

export type EditablePro = {
  licenseNo: string | null;
  designation: string | null;
  department: string | null;
  serviceAreas: string[];
  bio: string | null;
};

export type EditableCustomer = {
  nationality: string | null;
  passportNo: string | null;
  linkedClientId: string | null;
};

export type EditableEmployee = {
  clientId: string;
  passportNo: string | null;
  visaNo: string | null;
  visaExpiry: string | null;
  emiratesId: string | null;
  eidExpiry: string | null;
};

export type EditableUser =
  | { profile: EditableProfile; role: 'pro'; pro: EditablePro }
  | { profile: EditableProfile; role: 'customer'; customer: EditableCustomer }
  | { profile: EditableProfile; role: 'employee'; employee: EditableEmployee }
  | { profile: EditableProfile; role: 'admin' }
  | { profile: EditableProfile; role: 'super_admin' };

export async function getUserForEdit(targetId: string, caller: Caller): Promise<EditableUser> {
  const admin = createSupabaseServiceRoleClient();

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, full_name, phone, role, tenant_id, status, suspension_reason, mfa_enrolled_at')
    .eq('id', targetId)
    .maybeSingle();
  if (profileErr) throw new ApiError('INTERNAL', profileErr.message, 500);
  if (!profile) throw new ApiError('NOT_FOUND', 'User not found', 404);

  // Tenant scoping for admin caller. super_admin reads anyone.
  if (caller.role === 'admin') {
    if (profile.role === 'admin' || profile.role === 'super_admin') {
      throw new ApiError('FORBIDDEN', 'Admin cannot view this user', 403);
    }
    if (profile.tenant_id !== caller.tenantId) {
      throw new ApiError('FORBIDDEN', 'User belongs to a different tenant', 403);
    }
  }

  const { data: authUser } = await admin.auth.admin.getUserById(targetId);

  const baseProfile: EditableProfile = {
    id: profile.id as string,
    email: authUser?.user?.email ?? null,
    fullName: (profile.full_name as string | null) ?? null,
    phone: (profile.phone as string | null) ?? null,
    role: profile.role as Role,
    tenantId: (profile.tenant_id as string | null) ?? null,
    status: profile.status as ProfileStatus,
    suspensionReason: (profile.suspension_reason as string | null) ?? null,
    mfaEnrolledAt: (profile.mfa_enrolled_at as string | null) ?? null,
  };

  if (baseProfile.role === 'pro') {
    const { data: pro } = await admin
      .from('pro_profiles')
      .select('license_no_encrypted, designation, department, service_areas, bio')
      .eq('profile_id', targetId)
      .maybeSingle();
    return {
      profile: baseProfile,
      role: 'pro',
      pro: {
        licenseNo: decryptOptional(pro?.license_no_encrypted as string | null),
        designation: (pro?.designation as string | null) ?? null,
        department: (pro?.department as string | null) ?? null,
        serviceAreas: ((pro?.service_areas as string[] | null) ?? []) as string[],
        bio: (pro?.bio as string | null) ?? null,
      },
    };
  }

  if (baseProfile.role === 'customer') {
    const { data: customer } = await admin
      .from('customer_profiles')
      .select('nationality, passport_no_encrypted, linked_client_id')
      .eq('profile_id', targetId)
      .maybeSingle();
    return {
      profile: baseProfile,
      role: 'customer',
      customer: {
        nationality: (customer?.nationality as string | null) ?? null,
        passportNo: decryptOptional(customer?.passport_no_encrypted as string | null),
        linkedClientId: (customer?.linked_client_id as string | null) ?? null,
      },
    };
  }

  if (baseProfile.role === 'employee') {
    const { data: employee } = await admin
      .from('employees')
      .select(
        'client_id, passport_no_encrypted, visa_no_encrypted, visa_expiry, emirates_id_encrypted, eid_expiry',
      )
      .eq('profile_id', targetId)
      .maybeSingle();
    if (!employee) throw new ApiError('NOT_FOUND', 'Employee row missing', 404);
    return {
      profile: baseProfile,
      role: 'employee',
      employee: {
        clientId: employee.client_id as string,
        passportNo: decryptOptional(employee.passport_no_encrypted as string | null),
        visaNo: decryptOptional(employee.visa_no_encrypted as string | null),
        visaExpiry: (employee.visa_expiry as string | null) ?? null,
        emiratesId: decryptOptional(employee.emirates_id_encrypted as string | null),
        eidExpiry: (employee.eid_expiry as string | null) ?? null,
      },
    };
  }

  return { profile: baseProfile, role: baseProfile.role as 'admin' | 'super_admin' };
}
