import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { loginSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkLockout, clearFailures, recordFailure } from '@/lib/auth/lockout';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveRoleHome } from '@/lib/auth/role-home';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `login:${ip}`, ...RATE_LIMITS.authLoginIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }
  const { email, password } = parsed.data;

  const lockout = await checkLockout(email, ip);
  if (lockout.locked) {
    await recordAuthEvent({
      kind: 'login_failure',
      ip,
      userAgent,
      details: { email, reason: `lockout:${lockout.reason}` },
    });
    return errorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await recordFailure(email, ip);
    await recordAuthEvent({
      kind: 'login_failure',
      ip,
      userAgent,
      details: { email, reason: error?.message ?? 'unknown' },
    });
    return errorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Gate unconfirmed accounts server-side regardless of Supabase's "Confirm
  // email" toggle. Forces the OTP verification flow before a session is usable.
  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    await recordAuthEvent({
      kind: 'login_failure',
      actorUserId: data.user.id,
      ip,
      userAgent,
      details: { email, reason: 'email_not_verified' },
    });
    return errorResponse(
      'EMAIL_NOT_VERIFIED',
      'Verify your email first. Check your inbox for the code.',
      403,
      { email },
    );
  }

  await clearFailures(email);

  const appMeta = (data.user.app_metadata ?? {}) as {
    mandoob_role?: 'super_admin' | 'pro' | 'customer' | 'employee';
    tenant_id?: string | null;
  };
  const redirectTo = await resolveRoleHome({
    role: appMeta.mandoob_role ?? null,
    tenantId: appMeta.tenant_id ?? null,
  });

  await recordAuthEvent({
    kind: 'login_success',
    actorUserId: data.user.id,
    tenantId: appMeta.tenant_id ?? null,
    ip,
    userAgent,
    details: { email },
  });

  return jsonOk({ ok: true, userId: data.user.id, redirectTo });
}
