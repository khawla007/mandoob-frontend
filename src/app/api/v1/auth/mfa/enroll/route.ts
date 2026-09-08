import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { errorResponse, jsonOk } from '@/lib/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cleanupUnverifiedTotpFactors } from '@/lib/auth/mfa';
import { runAuthorizedMfaEnrollmentMutation } from '@/lib/auth/mfa-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

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

  const result = await runAuthorizedMfaEnrollmentMutation({
    loadFactors: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data) throw error ?? new Error('factor lookup failed');
      return data.all.map((factor) => ({
        id: factor.id,
        status: factor.status,
        type: factor.factor_type,
      }));
    },
    loadAssurance: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) throw error ?? new Error('assurance lookup failed');
      return data;
    },
    mutate: async (factors) => {
      const cleaned = await cleanupUnverifiedTotpFactors({
        listTotpFactors: async () => factors.filter((factor) => factor.type === 'totp'),
        removeFactor: async (factorId) => {
          const { error } = await supabase.auth.mfa.unenroll({ factorId });
          if (error) throw error;
        },
      });
      if (!cleaned) throw new Error('cleanup failed');
      const enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Mandoob TOTP',
      });
      if (enrolled.error || !enrolled.data) throw new Error('enroll failed');
      return enrolled.data;
    },
  });
  if (result.kind === 'challenge_required') {
    return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
  }
  if (result.kind === 'authorization_failed') {
    console.error('MFA enrollment authorization or mutation failed');
    return errorResponse('MFA_ENROLL_FAILED', 'Could not start MFA enrollment', 502);
  }
  const data = result.value;

  return jsonOk({
    factorId: data.id,
    qrCode: data.totp.qr_code,
    uri: data.totp.uri,
    secret: data.totp.secret,
  });
}
