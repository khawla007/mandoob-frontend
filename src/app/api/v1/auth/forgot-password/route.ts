import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { forgotPasswordSchema } from '@/lib/validation/auth';
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

  if (!(await consumeRateLimit({ key: `forgot:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  }
  const { email } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const host = request.headers.get('host') ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  const redirectTo = `${protocol}://${host}/auth/callback?next=/reset-password`;

  // Supabase returns success regardless of whether the email exists.
  // We mirror that: always return ok to prevent user enumeration.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  await recordAuthEvent({
    kind: 'password_reset_requested',
    ip,
    userAgent,
    details: { email },
  });

  return jsonOk({ ok: true });
}
