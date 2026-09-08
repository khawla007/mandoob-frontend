import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { z } from 'zod';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redeemRecoveryCode, resetMfaForRecovery } from '@/lib/auth/mfa';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  code: z.string().min(6).max(20),
});

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return errorResponse('UNAUTHENTICATED', 'Sign in first', 401);

  if (
    !(await consumeRateLimit({
      key: `mfa-recovery:${userData.user.id}`,
      ...RATE_LIMITS.authedPerUser,
    }))
  ) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);

  const ok = await redeemRecoveryCode(userData.user.id, parsed.data.code);
  if (!ok) {
    await recordAuthEvent({
      kind: 'mfa_challenge_failure',
      actorUserId: userData.user.id,
      ip,
      userAgent,
      details: { via: 'recovery_code' },
    });
    return errorResponse('MFA_INVALID_CODE', 'Invalid or used recovery code', 401);
  }

  if ((await resetMfaForRecovery(userData.user.id)) === 'repair_required') {
    console.error('MFA recovery reset failed');
    await recordAuthEvent({
      kind: 'mfa_challenge_failure',
      actorUserId: userData.user.id,
      ip,
      userAgent,
      details: { via: 'recovery_reset' },
    });
    return errorResponse('MFA_RECOVERY_REPAIR_REQUIRED', 'MFA recovery requires support', 502);
  }

  await recordAuthEvent({
    kind: 'mfa_reset',
    actorUserId: userData.user.id,
    ip,
    userAgent,
    details: { via: 'recovery_code' },
  });
  return jsonOk({ ok: true, redirectTo: '/login' });
}
