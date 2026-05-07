'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';
import {
  ProfileGeneralSchema,
  ProfilePhoneSchema,
  PasswordChangeSchema,
  MfaEnrollFinalizeSchema,
  RoleProSchema,
  RoleCustomerSchema,
  RoleEmployeeSchema,
} from '@/lib/validation/account';
import { updateSelfProfile, updateSelfRoleFields } from '@/lib/data/account-self';
import { optInPhoneChannels } from '@/lib/comms/consent';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { listUserSessions, revokeSessionById, type SessionSummary } from '@/lib/auth/sessions';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import { ApiError } from '@/lib/errors';

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

async function getActionContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim() ?? null;
  const userAgent = h.get('user-agent');
  return { ip, userAgent };
}

function fail(e: unknown): ActionResult {
  if (e instanceof ApiError) return { ok: false, error: { code: e.code, message: e.message } };
  console.error('account action failed', e);
  return { ok: false, error: { code: 'INTERNAL', message: 'Unexpected error' } };
}

export async function updateProfileAction(
  formInput: unknown,
): Promise<ActionResult<{ changedKeys: string[] }>> {
  try {
    const session = await requireUser();
    const useGeneral =
      session.role === 'super_admin' || session.role === 'admin' || session.role === 'pro';
    let updateInput: Parameters<typeof updateSelfProfile>[0];
    if (useGeneral) {
      const parsed = ProfileGeneralSchema.parse(formInput);
      const blank = (v: string | undefined) => (v && v.length > 0 ? v : null);
      updateInput = {
        display_name: parsed.display_name,
        phone: blank(parsed.phone),
        username: blank(parsed.username),
        title: blank(parsed.title),
        avatar_url: blank(parsed.avatar_url),
        locale: parsed.locale,
        timezone: parsed.timezone,
        date_format: parsed.date_format,
        bio: blank(parsed.bio),
      };
    } else {
      const parsed = ProfilePhoneSchema.parse(formInput);
      updateInput = { display_name: parsed.display_name, phone: parsed.phone };
    }
    const result = await updateSelfProfile(updateInput);
    if (result.changedKeys.length > 0) {
      const ctx = await getActionContext();
      await recordAuthEvent({
        kind: 'profile_self_edited',
        actorUserId: session.id,
        tenantId: session.tenantId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        details: { changed_keys: result.changedKeys },
      });
    }
    revalidatePath('/account');
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function changePasswordAction(formInput: unknown): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = PasswordChangeSchema.parse(formInput);
    if (!session.email) throw new ApiError('VALIDATION_FAILED', 'No email on session', 400);

    const supabase = await createSupabaseServerClient();
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: session.email,
      password: parsed.current_password,
    });
    if (reauthErr) {
      return {
        ok: false,
        error: { code: 'REAUTH_FAILED', message: 'Current password is incorrect' },
      };
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: parsed.new_password });
    if (updateErr) {
      return { ok: false, error: { code: 'PASSWORD_UPDATE_FAILED', message: updateErr.message } };
    }

    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'password_changed',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enrollMfaAction(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) {
      return {
        ok: false,
        error: { code: 'MFA_ENROLL_FAILED', message: error?.message ?? 'enroll failed' },
      };
    }
    return {
      ok: true,
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function finalizeMfaEnrollmentAction(formInput: unknown): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const parsed = MfaEnrollFinalizeSchema.parse(formInput);
    const supabase = await createSupabaseServerClient();
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: parsed.factor_id,
    });
    if (chErr || !challenge) {
      return {
        ok: false,
        error: { code: 'MFA_CHALLENGE_FAILED', message: chErr?.message ?? 'challenge failed' },
      };
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: parsed.factor_id,
      challengeId: challenge.id,
      code: parsed.code,
    });
    if (vErr) return { ok: false, error: { code: 'MFA_VERIFY_FAILED', message: vErr.message } };

    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'mfa_enrolled',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { factor_id: parsed.factor_id },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMfaFactorAction(factorId: string): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified');
    const willRemoveVerified = verified.some((f) => f.id === factorId);
    if (
      willRemoveVerified &&
      (session.role === 'super_admin' || session.role === 'pro') &&
      verified.length <= 1
    ) {
      return {
        ok: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'MFA is mandatory for this role; add another factor first',
        },
      };
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return { ok: false, error: { code: 'MFA_REMOVE_FAILED', message: error.message } };
    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'mfa_factor_removed',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { factor_id: factorId },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRoleFieldsAction(
  formInput: unknown,
): Promise<ActionResult<{ changedKeys: string[] }>> {
  try {
    const session = await requireUser();
    if (session.role !== 'pro' && session.role !== 'customer' && session.role !== 'employee') {
      return {
        ok: false,
        error: { code: 'NO_ROLE_TAB', message: 'No role-specific fields for this role' },
      };
    }
    const schema =
      session.role === 'pro'
        ? RoleProSchema
        : session.role === 'customer'
          ? RoleCustomerSchema
          : RoleEmployeeSchema;
    const parsed = schema.parse(formInput);
    const result = await updateSelfRoleFields(session.role, parsed);
    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'profile_self_edited',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { changed_keys: result.changedKeys, sub_table: session.role },
    });
    revalidatePath('/account/role');
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function optInSelfCommsAction(formInput: FormData): Promise<ActionResult> {
  try {
    const session = await requireUser();
    if (session.role !== 'customer' && session.role !== 'super_admin') {
      throw new ApiError('FORBIDDEN', 'Only customers can update communication preferences', 403);
    }
    const confirmation = String(formInput.get('confirmation') ?? '');
    if (confirmation !== 'OPT IN') {
      throw new ApiError('VALIDATION_FAILED', 'Confirmation is required', 400);
    }

    const supabase = await createSupabaseServerClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', session.id)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    const phone = (profile?.phone as string | null) ?? null;
    if (!phone) throw new ApiError('VALIDATION_FAILED', 'No phone number on profile', 400);

    await optInPhoneChannels({ phoneE164: phone, source: 'admin_action' });
    revalidatePath('/account');
    const returnPath = String(formInput.get('returnPath') ?? '');
    if (returnPath.startsWith('/t/')) revalidatePath(returnPath);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function gateSessionsRole(role: string | null): void {
  if (role !== 'super_admin' && role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'Sessions tab not available for this role', 403);
  }
}

export async function listMySessionsAction(): Promise<ActionResult<SessionSummary[]>> {
  try {
    const session = await requireUser();
    gateSessionsRole(session.role);
    const sessions = await listUserSessions(session.id);
    return { ok: true, data: sessions };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeMySessionAction(sessionId: string): Promise<ActionResult> {
  try {
    const session = await requireUser();
    gateSessionsRole(session.role);
    const sessions = await listUserSessions(session.id);
    const owns = sessions.some((s) => s.id === sessionId);
    if (!owns) throw new ApiError('FORBIDDEN', 'Session does not belong to caller', 403);
    await revokeSessionById(session.id, sessionId);
    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { session_id: sessionId, scope: 'one' },
    });
    revalidatePath('/account/sessions');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    gateSessionsRole(session.role);
    await revokeAllSessions(session.id);
    const ctx = await getActionContext();
    await recordAuthEvent({
      kind: 'session_revoked',
      actorUserId: session.id,
      tenantId: session.tenantId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      details: { scope: 'global' },
    });
    revalidatePath('/account/sessions');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
