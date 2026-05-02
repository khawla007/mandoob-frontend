import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { createHash, randomBytes } from 'node:crypto';
import { inviteCreateSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { sendInviteEmail } from '@/lib/mail/invite';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INVITE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return errorResponse('UNAUTHENTICATED', 'Sign in first', 401);

  const appMeta = (userData.user.app_metadata ?? {}) as {
    mandoob_role?: string;
    tenant_id?: string | null;
  };
  const actorRole = appMeta.mandoob_role;
  if (!(actorRole === 'pro' || actorRole === 'super_admin')) {
    return errorResponse('FORBIDDEN', 'Only PRO or super admins may invite', 403);
  }

  if (
    !(await consumeRateLimit({ key: `invite:${userData.user.id}`, ...RATE_LIMITS.authedPerUser }))
  ) {
    return errorResponse('RATE_LIMITED', 'Too many invites. Slow down.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = inviteCreateSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  const { email, role } = parsed.data;

  // super_admin inviting a pro-admin uses the caller's chosen tenant via header;
  // for now, restrict to inviter's own tenant.
  const tenantId = appMeta.tenant_id ?? request.headers.get('x-invite-tenant-id');
  if (!tenantId) return errorResponse('NO_TENANT', 'Inviter has no tenant context', 400);

  const admin = createSupabaseServiceRoleClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('slug,name')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant) return errorResponse('NO_TENANT', 'Tenant not found', 400);

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString();

  const { error } = await admin.from('invites').insert({
    tenant_id: tenantId,
    email,
    role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: userData.user.id,
  });
  if (error) return errorResponse('INVITE_CREATE_FAILED', error.message, 500);

  const rootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN;
  const protocol = rootDomain.startsWith('localhost') ? 'http' : 'https';
  const inviteUrl = `${protocol}://${tenant.slug}.${rootDomain}/invite/${token}`;

  try {
    await sendInviteEmail({ to: email, tenantName: tenant.name as string, role, inviteUrl });
  } catch (e) {
    // Invite is created but email failed — let the inviter retry manually.
    console.error('invite email failed', e);
  }

  await recordAuthEvent({
    kind: 'invite_created',
    actorUserId: userData.user.id,
    tenantId,
    ip,
    userAgent,
    details: { email, role },
  });

  return jsonOk({ ok: true, inviteUrl }, { status: 201 });
}
