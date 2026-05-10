import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { verifyEmailOrPhoneOtpSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { resolveRoleHome } from '@/lib/auth/role-home';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `otp:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = verifyEmailOrPhoneOtpSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  }
  const { email, phone, token } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = email
    ? await supabase.auth.verifyOtp({ email, token, type: 'email' })
    : await supabase.auth.verifyOtp({ phone: phone!, token, type: 'sms' });

  if (error || !data.user) {
    await recordAuthEvent({
      kind: 'login_failure',
      ip,
      userAgent,
      details: email ? { email, via: 'email_otp' } : { phone, via: 'phone_otp' },
    });
    return errorResponse('INVALID_OTP', 'Invalid or expired code', 401);
  }

  const admin = createSupabaseServiceRoleClient();
  if (email) {
    await admin.from('profiles').update({ status: 'active' }).eq('id', data.user.id);
    await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: {
        ...(data.user.app_metadata ?? {}),
        mandoob_status: 'active',
      },
    });
  }

  const appMeta = (data.user.app_metadata ?? {}) as {
    mandoob_role?: 'super_admin' | 'pro' | 'customer' | 'employee';
    tenant_id?: string | null;
  };
  if (phone) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, tenant_id, status, tenants(status)')
      .eq('id', data.user.id)
      .maybeSingle();
    const tenantRows = profile?.tenants as { status: string | null } | { status: string | null }[] | null;
    const tenantStatus = Array.isArray(tenantRows) ? tenantRows[0]?.status : tenantRows?.status;
    if (
      profile?.role !== 'employee' ||
      profile.status !== 'active' ||
      profile.tenant_id !== appMeta.tenant_id ||
      tenantStatus !== 'active'
    ) {
      await supabase.auth.signOut();
      await recordAuthEvent({
        kind: 'login_failure',
        actorUserId: data.user.id,
        tenantId: appMeta.tenant_id ?? null,
        ip,
        userAgent,
        details: { phone, via: 'phone_otp', reason: 'employee_portal_not_active' },
      });
      return errorResponse('FORBIDDEN', 'Employee portal is not active', 403);
    }
  }

  const redirectTo = await resolveRoleHome({
    role: appMeta.mandoob_role ?? 'customer',
    tenantId: appMeta.tenant_id ?? null,
  });

  await recordAuthEvent({
    kind: 'login_success',
    actorUserId: data.user.id,
    tenantId: appMeta.tenant_id ?? null,
    ip,
    userAgent,
    details: email ? { email, via: 'email_otp' } : { phone, via: 'phone_otp' },
  });

  return jsonOk({ ok: true, userId: data.user.id, redirectTo });
}
