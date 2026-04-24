import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { resendEmailOtpSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { sendOtpEmail } from '@/lib/mail/otp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);

  if (!(await consumeRateLimit({ key: `resend-otp:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = resendEmailOtpSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  const { email } = parsed.data;

  // Silent no-op for unknown / already-confirmed (no enumeration leak).
  // Magiclink type works for existing unconfirmed users and the email_otp is
  // verifiable via verifyOtp({type:'email'}).
  const admin = createSupabaseServiceRoleClient();
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const code = linkData?.properties?.email_otp;
  if (code) {
    try {
      await sendOtpEmail({ to: email, code });
    } catch {
      // swallow
    }
  }
  return jsonOk({ ok: true });
}
