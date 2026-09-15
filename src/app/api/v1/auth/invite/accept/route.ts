import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { createHash } from 'node:crypto';
import { inviteAcceptSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAuthorizedMutation } from '@/lib/auth/authorized-mutation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `invite-accept:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = inviteAcceptSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }
  const { token, password, fullName, phone, policyVersion } = parsed.data;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const admin = createSupabaseServiceRoleClient();

  const { data: invite } = await admin
    .from('invites')
    .select('id, tenant_id, email, role, expires_at, accepted_at, tenants(status)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const tenantRows = invite?.tenants as
    | { status: string | null }
    | { status: string | null }[]
    | null
    | undefined;
  const tenantStatus = Array.isArray(tenantRows) ? tenantRows[0]?.status : tenantRows?.status;
  if (!invite || invite.accepted_at || tenantStatus !== 'active') {
    return errorResponse('INVITE_INVALID', 'Invite not valid', 400);
  }
  if (new Date(invite.expires_at as string).getTime() < Date.now()) {
    return errorResponse('INVITE_EXPIRED', 'Invite has expired', 400);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email as string,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: {
      mandoob_role: invite.role,
      tenant_id: invite.tenant_id,
      mandoob_status: 'active',
    },
  });
  if (createErr || !created?.user) {
    return errorResponse('ACCEPT_FAILED', 'Could not accept invitation', 400);
  }

  const accepted = await runAuthorizedMutation({
    authorize: async () => ({ admin, userId: created.user.id }),
    run: async () => {
      const { error: profileError } = await admin.from('profiles').insert({
        id: created.user.id,
        tenant_id: invite.tenant_id,
        role: invite.role,
        status: 'active',
        full_name: fullName,
        phone: phone ?? null,
        consent_accepted_at: new Date().toISOString(),
        policy_version: policyVersion,
      });
      if (profileError) throw new Error('profile insert failed');

      const { data: finalized, error: acceptUpdateError } = await admin
        .from('invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
        .is('accepted_at', null)
        .select('id');
      if (acceptUpdateError || finalized?.length !== 1) {
        throw new Error('invitation finalization failed');
      }

      const supabase = await createSupabaseServerClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email as string,
        password,
      });
      if (signInError) throw new Error('invitation sign-in failed');
      return true;
    },
    compensate: async ({ admin: scopedAdmin, userId }) => {
      let authNeutralized = false;
      try {
        const { error: neutralizeError } = await scopedAdmin.auth.admin.updateUserById(userId, {
          ban_duration: '876000h',
          app_metadata: {
            mandoob_role: null,
            tenant_id: null,
            mandoob_status: 'disabled',
          },
        });
        authNeutralized = !neutralizeError;
      } catch {
        authNeutralized = false;
      }

      const { error: profileDisableError } = await scopedAdmin
        .from('profiles')
        .update({ status: 'disabled' })
        .eq('id', userId);
      const { error: profileDeleteError } = await scopedAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);
      let authDeleteError = false;
      try {
        const { error } = await scopedAdmin.auth.admin.deleteUser(userId);
        authDeleteError = Boolean(error);
      } catch {
        authDeleteError = true;
      }
      if (authDeleteError && !authNeutralized) {
        try {
          const { error } = await scopedAdmin.auth.admin.updateUserById(userId, {
            ban_duration: '876000h',
            app_metadata: {
              mandoob_role: null,
              tenant_id: null,
              mandoob_status: 'disabled',
            },
          });
          authNeutralized = !error;
        } catch {
          authNeutralized = false;
        }
      }
      if (profileDisableError || profileDeleteError || authDeleteError) {
        console.error('invite compensation incomplete', {
          authNeutralized,
          profileDisabled: !profileDisableError,
          profileDeleted: !profileDeleteError,
          authDeleted: !authDeleteError,
        });
      }
    },
    recover: () => false,
  });
  if (!accepted) return errorResponse('ACCEPT_FAILED', 'Could not accept invitation', 500);

  await recordAuthEvent({
    kind: 'invite_accepted',
    actorUserId: created.user.id,
    tenantId: invite.tenant_id as string,
    ip,
    userAgent,
    details: { role: invite.role },
  });

  return jsonOk({ ok: true, userId: created.user.id });
}
