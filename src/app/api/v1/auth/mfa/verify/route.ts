import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { z } from 'zod';
import { errorResponse } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { persistVerifiedMfaSession } from '@/lib/auth/mfa-session';
import { env } from '@/lib/env';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import {
  clearMfaEnrollment,
  deleteMfaFactorForUser,
  deleteRecoveryCodes,
  finalizeMfaEnrollmentWithDependencies,
  generateRecoveryCodes,
  markMfaEnrolled,
  persistRecoveryCodes,
} from '@/lib/auth/mfa';
import {
  runAuthorizedMfaEnrollmentMutation,
  runVerifiedMfaChallengeMutation,
} from '@/lib/auth/mfa-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.discriminatedUnion('context', [
  z.object({
    factorId: z.string().min(1),
    code: z.string().regex(/^\d{6,8}$/, 'Code must be 6-8 digits'),
    context: z.enum(['enroll', 'challenge']),
  }),
  z.object({ context: z.literal('challenge_confirmed') }),
]);

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  type PendingCookie = {
    name: string;
    value: string;
    options: CookieOptions;
  };
  const pendingCookies: PendingCookie[] = [];
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          pendingCookies.push(...cookies);
        },
      },
    },
  );
  const success = (body: Record<string, unknown>) => {
    const response = NextResponse.json(body, {
      headers: { 'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0' },
    });
    for (const cookie of pendingCookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return response;
  };
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
  if (parsed.data.context === 'challenge_confirmed') {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== 'aal2') {
      return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
    }
    await recordAuthEvent({
      kind: 'mfa_challenge_success',
      actorUserId: userData.user.id,
      ip,
      userAgent,
    });
    return success({ ok: true });
  }
  const { factorId, code, context } = parsed.data;

  const verifyFactor = async () => {
    const challengeResult = await supabase.auth.mfa.challenge({ factorId });
    if (challengeResult.error || !challengeResult.data) return { challengeResult };
    const verifyResult = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeResult.data.id,
      code,
    });
    return { challengeResult, verifyResult };
  };
  let verification: Awaited<ReturnType<typeof verifyFactor>>;
  if (context === 'enroll') {
    const authorized = await runAuthorizedMfaEnrollmentMutation({
      loadFactors: async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error || !data) throw error ?? new Error('factor lookup failed');
        return data.all.map((factor) => ({ id: factor.id, status: factor.status }));
      },
      loadAssurance: async () => {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || !data) throw error ?? new Error('assurance lookup failed');
        return data;
      },
      mutate: verifyFactor,
    });
    if (authorized.kind === 'challenge_required') {
      return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
    }
    if (authorized.kind === 'authorization_failed') {
      return errorResponse('MFA_ENROLL_FAILED', 'Could not authorize MFA enrollment', 502);
    }
    verification = authorized.value;
  } else {
    const authorized = await runVerifiedMfaChallengeMutation(factorId, {
      loadFactors: async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error || !data) throw error ?? new Error('factor lookup failed');
        return data.all.map((factor) => ({ id: factor.id, status: factor.status }));
      },
      mutate: verifyFactor,
    });
    if (authorized.kind === 'factor_rejected') {
      return errorResponse('MFA_INVALID_FACTOR', 'MFA factor is not available', 403);
    }
    if (authorized.kind === 'authorization_failed') {
      return errorResponse('MFA_CHALLENGE_FAILED', 'Could not authorize MFA challenge', 502);
    }
    verification = authorized.value;
  }

  const { data: challenge, error: chErr } = verification.challengeResult;
  if (chErr || !challenge) {
    if (chErr) console.error('MFA challenge provider failed');
    return errorResponse('MFA_CHALLENGE_FAILED', 'Could not start MFA verification', 400);
  }

  const { data: verify, error: vErr } = verification.verifyResult!;

  if (vErr || !verify) {
    if (vErr) console.error('MFA verification provider failed');
    await recordAuthEvent({
      kind: 'mfa_challenge_failure',
      actorUserId: userData.user.id,
      ip,
      userAgent,
      details: { context },
    });
    return errorResponse('MFA_INVALID_CODE', 'Invalid or expired code', 401);
  }
  if (!(await persistVerifiedMfaSession(supabase.auth, verify))) {
    return errorResponse('MFA_SESSION_FAILED', 'Unable to persist verified session', 502);
  }

  if (context === 'enroll') {
    const codes = generateRecoveryCodes();
    const finalized = await finalizeMfaEnrollmentWithDependencies(
      userData.user.id,
      factorId,
      codes,
      {
        persistCodes: persistRecoveryCodes,
        markEnrolled: markMfaEnrolled,
        revokeSessions: revokeAllSessions,
        deleteCodes: deleteRecoveryCodes,
        removeFactor: (targetFactorId) => deleteMfaFactorForUser(userData.user.id, targetFactorId),
        clearEnrollment: clearMfaEnrollment,
      },
    );
    if (finalized !== 'complete') {
      const repairRequired = finalized === 'repair_required';
      console.error(
        repairRequired
          ? 'MFA enrollment repair required'
          : 'MFA enrollment finalization rolled back',
      );
      return errorResponse(
        repairRequired ? 'MFA_ENROLL_REPAIR_REQUIRED' : 'MFA_ENROLL_FINALIZATION_FAILED',
        repairRequired
          ? 'MFA enrollment requires account support'
          : 'Could not finish MFA enrollment',
        502,
      );
    }
    await recordAuthEvent({
      kind: 'mfa_enrolled',
      actorUserId: userData.user.id,
      ip,
      userAgent,
    });
    return success({ ok: true, recoveryCodes: codes });
  }

  await recordAuthEvent({
    kind: 'mfa_challenge_success',
    actorUserId: userData.user.id,
    ip,
    userAgent,
  });
  return success({ ok: true });
}
