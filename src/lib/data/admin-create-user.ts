import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { encryptOptional } from '@/lib/crypto/pii';
import { hashPassportForLookup } from '@/lib/crypto/passport-lookup';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import type { CreateUserOutput } from '@/lib/validation/admin-user';
import type { Role } from '@/lib/auth/roles';
import { isUuid } from '@/lib/util/uuid';
import { env } from '@/lib/env';
import { tenantScopeForNewUser } from '@/lib/data/new-user-scope';
import { persistInvitedProfile } from '@/lib/data/invited-profile';
import { compensateInvitedUser } from '@/lib/data/invited-user-compensation';

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

export async function adminCreateUser(
  input: CreateUserOutput,
  ctx: AdminCreateUserContext,
): Promise<AdminCreateUserResult> {
  const admin = createSupabaseServiceRoleClient();

  // ── Cross-checks (§4 step 4) ─────────────────────────────────────────
  // Post role-rebase: admin and super_admin have identical platform business
  // permissions. Neither workflow can create a super_admin; that role remains a
  // development bootstrap concern. PRO users begin unassigned; customer and employee
  // identities are company-tenant scoped at creation.
  if (input.role === 'customer' || input.role === 'employee') {
    // Zod already enforces uuid; this is defense-in-depth in case the
    // orchestrator gets called from a non-route caller in the future.
    if (!input.tenant_id || !isUuid(input.tenant_id)) {
      throw new ApiError('VALIDATION_FAILED', 'tenant_id required for non-admin role', 400);
    }
  }
  if (input.role === 'employee') {
    const { data: company, error: companyErr } = await admin
      .from('company_profiles')
      .select('id, tenant_id')
      .eq('id', input.company_id)
      .maybeSingle();
    if (companyErr) {
      console.error('company lookup failed', companyErr);
      throw new ApiError('VALIDATION_FAILED', 'Company lookup failed', 400);
    }
    if (!company) throw new ApiError('VALIDATION_FAILED', 'company not found', 400);
    if (company.tenant_id !== input.tenant_id) {
      throw new ApiError('FORBIDDEN', 'company does not belong to selected tenant', 403);
    }
  }
  if (input.role === 'customer' && input.linked_company_id) {
    const { data: company, error: linkedErr } = await admin
      .from('company_profiles')
      .select('id, tenant_id')
      .eq('id', input.linked_company_id)
      .maybeSingle();
    if (linkedErr) {
      console.error('linked company lookup failed', linkedErr);
      throw new ApiError('VALIDATION_FAILED', 'Linked company lookup failed', 400);
    }
    if (company && company.tenant_id !== input.tenant_id) {
      throw new ApiError('FORBIDDEN', 'linked company does not belong to selected tenant', 403);
    }
  }

  // ── Email pre-flight (§4 step 6) ─────────────────────────────────────
  // Paginate listUsers until exhausted. listUsers has no email filter, so we
  // page through all auth users; safety cap at 50 pages × 200 = 10k. Past
  // 10k, the check silently passes — the invite call will then fail loudly
  // on the existing-email path (`INVITE_FAILED` 502) rather than emit a
  // duplicate. Replace with a dedicated `auth.users` index scan if user count
  // crosses that threshold.
  const email = input.email.toLowerCase();
  const PER_PAGE = 200;
  const MAX_PAGES = 50;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (listErr) {
      console.error('listUsers pre-flight failed', listErr);
      throw new ApiError('INVITE_FAILED', 'Email check failed', 502);
    }
    const users = data?.users ?? [];
    if (users.some((u) => (u.email ?? '').toLowerCase() === email)) {
      throw new ApiError('EMAIL_TAKEN', 'Email is already registered', 409);
    }
    if (users.length < PER_PAGE) break;
  }

  // ── Encrypt PII (§4 step 7) ──────────────────────────────────────────
  let encryptedPayload: Record<string, string | null> = {};
  try {
    if (input.role === 'customer') {
      encryptedPayload = {
        passport_no_encrypted: encryptOptional(input.passport_no ?? null),
      };
    } else if (input.role === 'employee') {
      encryptedPayload = {
        passport_no_encrypted: encryptOptional(input.passport_no ?? null),
        passport_no_hash: hashPassportForLookup(input.company_id, input.passport_no),
        visa_no_encrypted: encryptOptional(input.visa_no ?? null),
        emirates_id_encrypted: encryptOptional(input.emirates_id ?? null),
      };
    }
  } catch (e) {
    console.error('admin create user encryption failed', e);
    throw new ApiError('ENCRYPTION_FAILED', 'Could not prepare protected user data', 500);
  }

  // ── Native Supabase invite (§4 step 8) ───────────────────────────────
  const rootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN;
  const protocol = rootDomain.startsWith('localhost') ? 'http' : 'https';
  const redirectTo = `${protocol}://${rootDomain}/login`;
  const tenantIdForMeta = tenantScopeForNewUser(input);
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
    console.error('admin create user invite failed', inviteErr ?? { kind: 'missing_user' });
    throw new ApiError('INVITE_FAILED', 'Could not send user invitation', 502);
  }
  const newUserId = invited.user.id;

  // Compensating delete; logs failures so half-written state is observable.
  // Relies on `profiles.id` having ON DELETE CASCADE from auth.users (migration
  // 0001) and role sub-rows having ON DELETE CASCADE from `profiles`
  // (migrations 0012/0013).
  async function compensate(reason: string): Promise<void> {
    return compensateInvitedUser(admin, newUserId, reason);
  }

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
      console.error('updateUserById failed', updErr);
      await compensate('updateUserById error');
      throw new ApiError('INVITE_FAILED', 'Could not finalize invite', 502);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('updateUserById threw', e);
    await compensate('updateUserById threw');
    throw new ApiError('INVITE_FAILED', 'Could not finalize invite', 502);
  }

  // ── Persist profile row (§4 step 10) ─────────────────────────────────
  // Supabase Auth does not create this application's root profile row. An
  // upsert is authoritative for both that normal case and deployments that
  // add an auth-user trigger later; the role sub-row FK must only run after it.
  try {
    await persistInvitedProfile(admin, {
      id: newUserId,
      full_name: input.full_name,
      phone: input.phone,
      status: 'invited',
      tenant_id: tenantIdForMeta,
      locale: 'en',
      role: input.role,
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('profiles upsert failed', e);
    await compensate('profiles upsert failed');
    throw new ApiError('VALIDATION_FAILED', 'Could not finalize profile', 500);
  }

  // ── Insert role sub-row (§4 step 11) ─────────────────────────────────
  try {
    if (input.role === 'pro') {
      const { error } = await admin.from('pro_profiles').insert({
        profile_id: newUserId,
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
        linked_company_id: input.linked_company_id ?? null,
      });
      if (error) throw error;
    } else if (input.role === 'employee') {
      const { error } = await admin.from('employees').insert({
        tenant_id: input.tenant_id,
        company_id: input.company_id,
        profile_id: newUserId,
        name: input.full_name,
        email,
        phone: input.phone,
        passport_no_encrypted: encryptedPayload.passport_no_encrypted,
        passport_no_hash: encryptedPayload.passport_no_hash,
        visa_no_encrypted: encryptedPayload.visa_no_encrypted,
        visa_expiry: input.visa_expiry ?? null,
        emirates_id_encrypted: encryptedPayload.emirates_id_encrypted,
        eid_expiry: input.eid_expiry ?? null,
        status: 'active',
      });
      if (error) throw error;
    }
    // role === 'admin' has no sub-row.
    // Audit trail asymmetry: admin role logs to `admin_audit_actions` (§4 step 12);
    // every role logs to `auth_events` via `recordAuthEvent` below (§4 step 13).
  } catch (e) {
    const errorCode = typeof e === 'object' && e !== null ? (e as { code?: string }).code : null;
    if (input.role === 'employee' && errorCode === '23505') {
      console.error('admin-create-user.employee-passport duplicate');
      await compensate('employee passport duplicate');
      throw new ApiError('PASSPORT_DUPLICATE', 'Passport already belongs to this company', 409);
    }
    console.error('sub-row insert failed', e);
    await compensate('sub-row insert error');
    const isRls = errorCode === '42501';
    throw new ApiError(
      isRls ? 'RLS_DENIED' : 'VALIDATION_FAILED',
      isRls ? 'Row-level security denied the insert' : 'Could not create role profile',
      isRls ? 403 : 500,
    );
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
