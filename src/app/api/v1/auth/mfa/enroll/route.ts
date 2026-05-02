import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent } from '@/lib/auth/request';
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

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return errorResponse('UNAUTHENTICATED', 'Sign in first', 401);

  if (
    !(await consumeRateLimit({
      key: `mfa-enroll:${userData.user.id}`,
      ...RATE_LIMITS.authedPerUser,
    }))
  ) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Mandoob TOTP',
  });
  if (error || !data) {
    return errorResponse('MFA_ENROLL_FAILED', error?.message ?? 'unknown', 400);
  }

  await recordAuthEvent({
    kind: 'mfa_enrolled',
    actorUserId: userData.user.id,
    ip,
    userAgent,
    details: { factorId: data.id },
  });

  return jsonOk({
    factorId: data.id,
    qrCode: data.totp.qr_code,
    uri: data.totp.uri,
    secret: data.totp.secret,
  });
}
