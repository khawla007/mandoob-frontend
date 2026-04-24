import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { resetPasswordSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `reset:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }
  const { password } = parsed.data;

  // Reset flow: after the email link, the callback route exchanges the code for
  // a session. This endpoint runs in that authenticated context and updates the
  // password against the current user.
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return errorResponse('UNAUTHENTICATED', 'Reset link expired or invalid', 401);
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) {
    return errorResponse('RESET_FAILED', 'Could not update password', 400, {
      reason: updateErr.message,
    });
  }

  // Revoke all other sessions after a password change.
  await supabase.auth.signOut({ scope: 'others' });

  await recordAuthEvent({
    kind: 'password_reset_completed',
    actorUserId: userData.user.id,
    ip,
    userAgent,
  });

  return jsonOk({ ok: true });
}
