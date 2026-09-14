import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { authorizeMfaEnrollment } from '@/lib/auth/mfa-enrollment';

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

  const authorization = await authorizeMfaEnrollment({
    listFactors: async () => {
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError || !factors) throw factorError ?? new Error('MFA factor lookup failed');
      return factors.all.map((factor) => ({
        id: factor.id,
        status: factor.status,
        type: factor.factor_type,
      }));
    },
    loadAssurance: async () => {
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || !assurance) {
        throw assuranceError ?? new Error('MFA assurance lookup failed');
      }
      return assurance;
    },
    removeFactor: async (factorId) => {
      const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId });
      if (cleanupError) throw cleanupError;
    },
  });
  if (authorization === 'challenge_required') {
    return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
  }
  if (authorization === 'already_enrolled') {
    return errorResponse('MFA_ALREADY_ENROLLED', 'MFA is already enrolled', 409);
  }
  if (authorization === 'failed') {
    return errorResponse('MFA_ENROLL_FAILED', 'Could not start MFA enrollment', 502);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Mandoob TOTP',
  });
  if (error || !data) {
    return errorResponse('MFA_ENROLL_FAILED', 'Could not start MFA enrollment', 400);
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
