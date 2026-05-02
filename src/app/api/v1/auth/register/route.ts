import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { registerSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { generateUniqueUsername } from '@/lib/auth/username';
import { sendOtpEmail } from '@/lib/mail/otp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_TENANT_SLUG = 'pub';

async function getOrCreatePubTenant(): Promise<string> {
  const admin = createSupabaseServiceRoleClient();
  const { data: existing } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', PUBLIC_TENANT_SLUG)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from('tenants')
    .insert({
      slug: PUBLIC_TENANT_SLUG,
      name: 'Public Self-Signup',
      plan: 'starter',
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`failed to provision pub tenant: ${error?.message}`);
  return created.id as string;
}

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `register:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }
  const { email, password, fullName, phone, policyVersion } = parsed.data;

  const admin = createSupabaseServiceRoleClient();

  let username: string;
  try {
    username = await generateUniqueUsername(admin, fullName);
  } catch (err) {
    return errorResponse(
      'USERNAME_GENERATION_FAILED',
      err instanceof Error ? err.message : 'Could not generate username',
      500,
    );
  }

  const tenantId = await getOrCreatePubTenant();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, username },
    app_metadata: {
      mandoob_role: 'customer',
      tenant_id: tenantId,
      mandoob_status: 'pending',
    },
  });
  if (createErr || !created?.user) {
    return errorResponse(
      'REGISTRATION_FAILED',
      createErr?.message ?? 'Could not create account',
      400,
    );
  }
  const userId = created.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      tenant_id: tenantId,
      role: 'customer',
      status: 'invited',
      username,
      full_name: fullName,
      phone: phone ?? null,
      consent_accepted_at: new Date().toISOString(),
      policy_version: policyVersion,
    },
    { onConflict: 'id' },
  );
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    const taken = /duplicate key|profiles_username_unique/i.test(profileErr.message);
    return errorResponse(
      taken ? 'USERNAME_TAKEN' : 'REGISTRATION_FAILED',
      taken ? 'That username is already taken' : 'Could not finalize registration',
      taken ? 409 : 500,
      { reason: profileErr.message },
    );
  }

  // Supabase-issued signup OTP — length controlled by project Auth config
  // (dashboard → Auth → Providers → Email → "Email OTP Length", 6–10, default 6).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
  });
  if (linkErr || !linkData.properties?.email_otp) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return errorResponse(
      'OTP_GENERATION_FAILED',
      linkErr?.message ?? 'Could not generate verification code',
      500,
    );
  }

  try {
    await sendOtpEmail({ to: email, code: linkData.properties.email_otp });
  } catch (err) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return errorResponse(
      'EMAIL_SEND_FAILED',
      err instanceof Error ? err.message : 'Could not send verification email',
      500,
    );
  }

  await recordAuthEvent({
    kind: 'invite_created',
    actorUserId: userId,
    tenantId,
    ip,
    userAgent,
    details: { email, via: 'self_signup' },
  });

  return jsonOk({ ok: true, email }, { status: 201 });
}
