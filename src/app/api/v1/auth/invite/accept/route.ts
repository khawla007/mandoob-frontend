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
    .select('id, tenant_id, email, role, expires_at, accepted_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite || invite.accepted_at) {
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
  });
  if (createErr || !created?.user) {
    return errorResponse('ACCEPT_FAILED', createErr?.message ?? 'unknown', 400);
  }

  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    tenant_id: invite.tenant_id,
    role: invite.role,
    status: 'active',
    full_name: fullName,
    phone: phone ?? null,
    consent_accepted_at: new Date().toISOString(),
    policy_version: policyVersion,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return errorResponse('ACCEPT_FAILED', profileErr.message, 500);
  }

  await admin.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

  // Auto-login.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({
    email: invite.email as string,
    password,
  });

  await recordAuthEvent({
    kind: 'invite_accepted',
    actorUserId: created.user.id,
    tenantId: invite.tenant_id as string,
    ip,
    userAgent,
    details: { email: invite.email, role: invite.role },
  });

  return jsonOk({ ok: true, userId: created.user.id });
}
