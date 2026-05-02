import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { z } from 'zod';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateRecoveryCodes, markMfaEnrolled, persistRecoveryCodes } from '@/lib/auth/mfa';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  factorId: z.string().min(1),
  code: z.string().regex(/^\d{6,8}$/, 'Code must be 6-8 digits'),
  context: z.enum(['enroll', 'challenge']),
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
      key: `mfa-verify:${userData.user.id}`,
      ...RATE_LIMITS.authedPerUser,
    }))
  ) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  const { factorId, code, context } = parsed.data;

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr || !challenge) {
    return errorResponse('MFA_CHALLENGE_FAILED', chErr?.message ?? 'unknown', 400);
  }

  const { data: verify, error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (vErr || !verify) {
    await recordAuthEvent({
      kind: 'mfa_challenge_failure',
      actorUserId: userData.user.id,
      ip,
      userAgent,
      details: { context },
    });
    return errorResponse('MFA_INVALID_CODE', 'Invalid or expired code', 401);
  }

  if (context === 'enroll') {
    await markMfaEnrolled(userData.user.id);
    const codes = generateRecoveryCodes();
    await persistRecoveryCodes(userData.user.id, codes);
    await recordAuthEvent({
      kind: 'mfa_enrolled',
      actorUserId: userData.user.id,
      ip,
      userAgent,
    });
    return jsonOk({ ok: true, recoveryCodes: codes });
  }

  await recordAuthEvent({
    kind: 'mfa_challenge_success',
    actorUserId: userData.user.id,
    ip,
    userAgent,
  });
  return jsonOk({ ok: true });
}
