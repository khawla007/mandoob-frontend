import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { encryptOptional } from '@/lib/crypto/pii';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import type { CreateUserOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';
import { env } from '@/lib/env';

export type AdminCreateUserCaller = {
  id: string;
  role: Role;
  tenantId: string | null;
};

export type AdminCreateUserResult = {
  userId: string;
  auditWarning: boolean;
};

export type AdminCreateUserContext = {
  caller: AdminCreateUserCaller;
  ip: string;
  userAgent: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function adminCreateUser(
  input: CreateUserOutput,
  ctx: AdminCreateUserContext,
): Promise<AdminCreateUserResult> {
  const admin = createSupabaseServiceRoleClient();

  // ── Cross-checks (§4 step 4) ─────────────────────────────────────────
  if (input.role === 'admin' && ctx.caller.role !== 'super_admin') {
    throw new ApiError('FORBIDDEN', 'Only super admins can create admins', 403);
  }
  if (input.role !== 'admin') {
    if (!input.tenant_id || !UUID_RE.test(input.tenant_id)) {
      throw new ApiError('VALIDATION_FAILED', 'tenant_id required for non-admin role', 400);
    }
    if (ctx.caller.role === 'admin' && ctx.caller.tenantId !== input.tenant_id) {
      throw new ApiError('FORBIDDEN', 'Admin caller cannot pick a different tenant', 403);
    }
  }
  if (input.role === 'employee') {
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', input.client_id)
      .maybeSingle();
    if (clientErr) throw new ApiError('VALIDATION_FAILED', clientErr.message, 400);
    if (!client) throw new ApiError('VALIDATION_FAILED', 'client not found', 400);
    if (client.tenant_id !== input.tenant_id) {
      throw new ApiError('FORBIDDEN', 'client does not belong to selected tenant', 403);
    }
  }
  if (input.role === 'customer' && input.linked_client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', input.linked_client_id)
      .maybeSingle();
    if (client && client.tenant_id !== input.tenant_id) {
      throw new ApiError('FORBIDDEN', 'linked client does not belong to selected tenant', 403);
    }
  }

  // ── Email pre-flight (§4 step 6) ─────────────────────────────────────
  const email = input.email.toLowerCase();
  const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new ApiError('INVITE_FAILED', listErr.message, 502);
  if ((existing?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === email)) {
    throw new ApiError('EMAIL_TAKEN', 'Email is already registered', 409);
  }

  // ── Encrypt PII (§4 step 7) ──────────────────────────────────────────
  let encryptedPayload: Record<string, string | null> = {};
  try {
    if (input.role === 'pro') {
      encryptedPayload = { license_no_encrypted: encryptOptional(input.license_no) };
    } else if (input.role === 'customer') {
      encryptedPayload = {
        passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      };
    } else if (input.role === 'employee') {
      encryptedPayload = {
        passport_no_encrypted: encryptOptional(input.passport_no ?? null),
        visa_no_encrypted: encryptOptional(input.visa_no ?? null),
        emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      };
    }
  } catch (e) {
    throw new ApiError(
      'ENCRYPTION_FAILED',
      e instanceof Error ? e.message : 'PII encryption failed',
      500,
    );
  }

  // ── Native Supabase invite (§4 step 8) ───────────────────────────────
  const rootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN;
  const protocol = rootDomain.startsWith('localhost') ? 'http' : 'https';
  const redirectTo = `${protocol}://${rootDomain}/login`;
  const tenantIdForMeta =
    input.role === 'admin'
      ? null
      : (input as Extract<CreateUserOutput, { tenant_id: string }>).tenant_id;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: input.full_name,
      phone: input.phone,
      intended_role: input.role,
      intended_tenant_id: tenantIdForMeta,
    },
    redirectTo,
  });
  if (inviteErr || !invited?.user) {
    throw new ApiError(
      'INVITE_FAILED',
      inviteErr?.message ?? 'inviteUserByEmail returned no user',
      502,
    );
  }
  const newUserId = invited.user.id;

  // ── Patch app_metadata (§4 step 9) ───────────────────────────────────
  try {
    const { error: updErr } = await admin.auth.admin.updateUserById(newUserId, {
      app_metadata: {
        mandoob_role: input.role,
        tenant_id: tenantIdForMeta,
        mandoob_status: 'invited',
      },
    });
    if (updErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new ApiError('INVITE_FAILED', updErr.message, 502);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    throw new ApiError(
      'INVITE_FAILED',
      e instanceof Error ? e.message : 'updateUserById failed',
      502,
    );
  }

  // ── Update profile row (§4 step 10) ──────────────────────────────────
  try {
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        full_name: input.full_name,
        phone: input.phone,
        status: 'invited',
        tenant_id: tenantIdForMeta,
        locale: 'en',
        role: input.role,
      })
      .eq('id', newUserId);
    if (profileErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new ApiError('VALIDATION_FAILED', profileErr.message, 500);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    throw new ApiError(
      'VALIDATION_FAILED',
      e instanceof Error ? e.message : 'profile update failed',
      500,
    );
  }

  // ── Insert role sub-row (§4 step 11) ─────────────────────────────────
  try {
    if (input.role === 'pro') {
      const { error } = await admin.from('pro_profiles').insert({
        profile_id: newUserId,
        license_no_encrypted: encryptedPayload.license_no_encrypted,
        designation: input.designation ?? null,
        department: input.department ?? null,
        service_areas: input.service_areas,
        bio: input.bio ?? null,
      });
      if (error) throw error;
    } else if (input.role === 'customer') {
      const { error } = await admin.from('customer_profiles').insert({
        profile_id: newUserId,
        nationality: input.nationality ?? null,
        passport_no_encrypted: encryptedPayload.passport_no_encrypted,
        linked_client_id: input.linked_client_id ?? null,
      });
      if (error) throw error;
    } else if (input.role === 'employee') {
      const { error } = await admin.from('employees').insert({
        tenant_id: input.tenant_id,
        client_id: input.client_id,
        profile_id: newUserId,
        name: input.full_name,
        email,
        phone: input.phone,
        passport_no_encrypted: encryptedPayload.passport_no_encrypted,
        visa_no_encrypted: encryptedPayload.visa_no_encrypted,
        visa_expiry: input.visa_expiry ?? null,
        emirates_id_encrypted: encryptedPayload.emirates_id_encrypted,
        eid_expiry: input.eid_expiry ?? null,
        status: 'active',
      });
      if (error) throw error;
    }
    // role === 'admin' has no sub-row
  } catch (e) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    const msg = e instanceof Error ? e.message : 'sub-row insert failed';
    const isRls = typeof e === 'object' && e !== null && (e as { code?: string }).code === '42501';
    throw new ApiError(isRls ? 'RLS_DENIED' : 'VALIDATION_FAILED', msg, isRls ? 403 : 500);
  }

  // ── Audit (§4 step 12 — best-effort) ─────────────────────────────────
  let auditWarning = false;
  if (input.role === 'admin') {
    const { error: auditErr } = await admin.from('admin_audit_actions').insert({
      actor_id: ctx.caller.id,
      action: 'create_admin',
      target_profile_id: newUserId,
      reason: input.reason ?? null,
    });
    if (auditErr) {
      console.error('admin_audit_actions insert failed', auditErr);
      auditWarning = true;
    }
  }

  // ── Auth event (§4 step 13 — best-effort) ────────────────────────────
  await recordAuthEvent({
    kind: 'admin_created',
    actorUserId: ctx.caller.id,
    tenantId: tenantIdForMeta,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { target_id: newUserId, target_role: input.role },
  }).catch((err) => {
    console.error('recordAuthEvent failed', err);
  });

  return { userId: newUserId, auditWarning };
}
