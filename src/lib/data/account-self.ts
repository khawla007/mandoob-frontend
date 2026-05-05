import 'server-only';
import { ApiError } from '@/lib/errors';
import { decryptOptional, encryptOptional } from '@/lib/crypto/pii';
import type { Role } from '@/lib/auth/roles';

export type ReadSelfProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Role;
  tenantId: string | null;
  createdAt: string | null;
  mfaEnrolledAt: string | null;
  username: string | null;
  title: string | null;
  bio: string | null;
  locale: string;
  timezone: string;
  dateFormat: string;
  avatarUrl: string | null;
};

export type ReadSelfPro = {
  licenseNo: string | null;
  designation: string | null;
  department: string | null;
  serviceAreas: string[];
  bio: string | null;
};

export type ReadSelfCustomer = {
  nationality: string | null;
  passportNo: string | null;
  linkedClientId: string | null;
};

export type ReadSelfEmployee = {
  clientId: string;
  passportNo: string | null;
  visaNo: string | null;
  visaExpiry: string | null;
  emiratesId: string | null;
  eidExpiry: string | null;
};

export async function readSelfProfile(): Promise<ReadSelfProfile> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, phone, role, tenant_id, created_at, mfa_enrolled_at, username, title, bio, locale, timezone, date_format, avatar_url',
    )
    .eq('id', userRes.user.id)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Profile not found', 404);

  return {
    id: data.id as string,
    email: userRes.user.email ?? null,
    fullName: (data.full_name as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    role: data.role as Role,
    tenantId: (data.tenant_id as string | null) ?? null,
    createdAt: (data.created_at as string | null) ?? null,
    mfaEnrolledAt: (data.mfa_enrolled_at as string | null) ?? null,
    username: (data.username as string | null) ?? null,
    title: (data.title as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    locale: ((data.locale as string | null) ?? 'en') as string,
    timezone: ((data.timezone as string | null) ?? 'Asia/Dubai') as string,
    dateFormat: ((data.date_format as string | null) ?? 'YYYY-MM-DD') as string,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}

export async function readSelfPro(): Promise<ReadSelfPro> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const { data } = await supabase
    .from('pro_profiles')
    .select('license_no_encrypted, designation, department, service_areas, bio')
    .eq('profile_id', userRes.user.id)
    .maybeSingle();
  return {
    licenseNo: decryptOptional(data?.license_no_encrypted as string | null),
    designation: (data?.designation as string | null) ?? null,
    department: (data?.department as string | null) ?? null,
    serviceAreas: ((data?.service_areas as string[] | null) ?? []) as string[],
    bio: (data?.bio as string | null) ?? null,
  };
}

export async function readSelfCustomer(): Promise<ReadSelfCustomer> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const { data } = await supabase
    .from('customer_profiles')
    .select('nationality, passport_no_encrypted, linked_client_id')
    .eq('profile_id', userRes.user.id)
    .maybeSingle();
  return {
    nationality: (data?.nationality as string | null) ?? null,
    passportNo: decryptOptional(data?.passport_no_encrypted as string | null),
    linkedClientId: (data?.linked_client_id as string | null) ?? null,
  };
}

export async function readSelfEmployee(): Promise<ReadSelfEmployee> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const { data, error } = await supabase
    .from('employees')
    .select(
      'client_id, passport_no_encrypted, visa_no_encrypted, visa_expiry, emirates_id_encrypted, eid_expiry',
    )
    .eq('profile_id', userRes.user.id)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Employee row missing', 404);
  return {
    clientId: data.client_id as string,
    passportNo: decryptOptional(data.passport_no_encrypted as string | null),
    visaNo: decryptOptional(data.visa_no_encrypted as string | null),
    visaExpiry: (data.visa_expiry as string | null) ?? null,
    emiratesId: decryptOptional(data.emirates_id_encrypted as string | null),
    eidExpiry: (data.eid_expiry as string | null) ?? null,
  };
}

export type ProfileDiffInput = {
  display_name: string;
  phone?: string | null;
  username?: string | null;
  title?: string | null;
  avatar_url?: string | null;
  locale?: string;
  timezone?: string;
  date_format?: string;
  bio?: string | null;
};

type ProfileExistingRow = {
  full_name: string | null;
  phone: string | null;
  username: string | null;
  title: string | null;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  date_format: string | null;
  bio: string | null;
};

export function diffProfile(
  existing: { full_name: string | null; phone: string | null } | ProfileExistingRow,
  next: ProfileDiffInput,
): { update: Record<string, unknown>; changedKeys: string[] } {
  const changedKeys: string[] = [];
  const update: Record<string, unknown> = {};
  const e = existing as ProfileExistingRow;

  if (next.display_name !== e.full_name) {
    update.full_name = next.display_name;
    changedKeys.push('full_name');
  }
  if (next.phone !== undefined && next.phone !== e.phone) {
    update.phone = next.phone ?? null;
    changedKeys.push('phone');
  }
  if (next.username !== undefined && (next.username ?? null) !== (e.username ?? null)) {
    update.username = next.username ?? null;
    changedKeys.push('username');
  }
  if (next.title !== undefined && (next.title ?? null) !== (e.title ?? null)) {
    update.title = next.title ?? null;
    changedKeys.push('title');
  }
  if (next.avatar_url !== undefined && (next.avatar_url ?? null) !== (e.avatar_url ?? null)) {
    update.avatar_url = next.avatar_url ?? null;
    changedKeys.push('avatar_url');
  }
  if (next.locale !== undefined && next.locale !== e.locale) {
    update.locale = next.locale;
    changedKeys.push('locale');
  }
  if (next.timezone !== undefined && next.timezone !== e.timezone) {
    update.timezone = next.timezone;
    changedKeys.push('timezone');
  }
  if (next.date_format !== undefined && next.date_format !== e.date_format) {
    update.date_format = next.date_format;
    changedKeys.push('date_format');
  }
  if (next.bio !== undefined && (next.bio ?? null) !== (e.bio ?? null)) {
    update.bio = next.bio ?? null;
    changedKeys.push('bio');
  }
  return { update, changedKeys };
}

export type RoleProUpdate = {
  license_no?: string | null;
  designation?: string | null;
  department?: string | null;
  service_areas: string[];
  bio?: string | null;
};

export type RoleCustomerUpdate = {
  nationality?: string | null;
  passport_no?: string | null;
};

export type RoleEmployeeUpdate = {
  passport_no?: string | null;
};

export type RoleUpdateInput = RoleProUpdate | RoleCustomerUpdate | RoleEmployeeUpdate;

export function buildRoleUpdate(
  role: 'pro' | 'customer' | 'employee',
  input: RoleUpdateInput,
): Record<string, unknown> {
  if (role === 'pro') {
    const i = input as RoleProUpdate;
    return {
      license_no_encrypted: encryptOptional(i.license_no ?? null),
      designation: i.designation ?? null,
      department: i.department ?? null,
      service_areas: i.service_areas,
      bio: i.bio ?? null,
    };
  }
  if (role === 'customer') {
    const i = input as RoleCustomerUpdate;
    return {
      nationality: i.nationality ?? null,
      passport_no_encrypted: encryptOptional(i.passport_no ?? null),
    };
  }
  const i = input as RoleEmployeeUpdate;
  return {
    passport_no_encrypted: encryptOptional(i.passport_no ?? null),
  };
}

export type UpdateSelfProfileResult = { changedKeys: string[] };

export async function updateSelfProfile(input: ProfileDiffInput): Promise<UpdateSelfProfileResult> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('full_name, phone, username, title, avatar_url, locale, timezone, date_format, bio')
    .eq('id', userRes.user.id)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'Profile not found', 404);

  const { update, changedKeys } = diffProfile(
    {
      full_name: (existing.full_name as string | null) ?? null,
      phone: (existing.phone as string | null) ?? null,
      username: (existing.username as string | null) ?? null,
      title: (existing.title as string | null) ?? null,
      avatar_url: (existing.avatar_url as string | null) ?? null,
      locale: (existing.locale as string | null) ?? null,
      timezone: (existing.timezone as string | null) ?? null,
      date_format: (existing.date_format as string | null) ?? null,
      bio: (existing.bio as string | null) ?? null,
    },
    input,
  );
  if (changedKeys.length === 0) return { changedKeys: [] };

  const { error } = await supabase.from('profiles').update(update).eq('id', userRes.user.id);
  if (error) throw new ApiError('VALIDATION_FAILED', error.message, 400);
  return { changedKeys };
}

export async function updateSelfRoleFields(
  role: 'pro' | 'customer' | 'employee',
  input: RoleUpdateInput,
): Promise<{ changedKeys: string[] }> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const update = buildRoleUpdate(role, input);
  const table =
    role === 'pro' ? 'pro_profiles' : role === 'customer' ? 'customer_profiles' : 'employees';
  const { error } = await supabase.from(table).update(update).eq('profile_id', userRes.user.id);
  if (error) throw new ApiError('VALIDATION_FAILED', error.message, 400);
  return { changedKeys: Object.keys(update) };
}
