import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { startPhoneOtpSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  if (!(await consumeRateLimit({ key: `phone-otp:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = startPhoneOtpSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  const { phone } = parsed.data;

  const admin = createSupabaseServiceRoleClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, tenant_id, status, tenants(status)')
    .eq('phone', phone)
    .eq('role', 'employee')
    .maybeSingle();

  const tenantRows = profile?.tenants as { status: string | null } | { status: string | null }[] | null;
  const tenantStatus = Array.isArray(tenantRows) ? tenantRows[0]?.status : tenantRows?.status;
  const canStart =
    profile?.role === 'employee' && profile.status === 'active' && tenantStatus === 'active';

  if (canStart) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      await recordAuthEvent({
        kind: 'login_failure',
        actorUserId: profile.id,
        tenantId: profile.tenant_id,
        ip,
        userAgent,
        details: { phone, via: 'phone_otp_start', status: 'failed' },
      });
    }
  }

  return jsonOk({ ok: true });
}
