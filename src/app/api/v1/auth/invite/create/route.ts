import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { createHash, randomBytes } from 'node:crypto';
import { inviteCreateSchema } from '@/lib/validation/auth';
import { errorResponse, jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { sendInviteEmail } from '@/lib/mail/invite';
import { env } from '@/lib/env';
import { buildTenantUrl } from '@/lib/tenant/url';
import { getAuthoritativeSessionProfile } from '@/lib/auth/require-role';
import { resolveInviteTenant } from '@/lib/auth/invite-authorization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INVITE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const actor = await getAuthoritativeSessionProfile({
    allowedRoles: ['pro', 'admin', 'super_admin'],
  });
  if (!actor) return errorResponse('UNAUTHENTICATED', 'Sign in first', 401);

  if (!(await consumeRateLimit({ key: `invite:${actor.id}`, ...RATE_LIMITS.authedPerUser }))) {
    return errorResponse('RATE_LIMITED', 'Too many invites. Slow down.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = inviteCreateSchema.safeParse(raw);
  if (!parsed.success) return errorResponse('INVALID_INPUT', 'Invalid request', 400);
  const { email, role } = parsed.data;

  const tenantId = resolveInviteTenant(actor, request.headers.get('x-invite-tenant-id'), role);
  if (!tenantId) return errorResponse('FORBIDDEN', 'Invitation is not allowed', 403);

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
    created_by: actor.id,
  });
  if (error) return errorResponse('INVITE_CREATE_FAILED', 'Could not create invitation', 500);

  const inviteUrl = buildTenantUrl({
    slug: tenant.slug as string,
    rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN,
    path: `/invite/${token}`,
  });

  try {
    await sendInviteEmail({ to: email, tenantName: tenant.name as string, role, inviteUrl });
  } catch {
    await admin.from('invites').delete().eq('token_hash', tokenHash);
    console.error('invite-delivery.failed');
    return errorResponse('INVITE_CREATE_FAILED', 'Could not deliver invitation', 503);
  }

  await recordAuthEvent({
    kind: 'invite_created',
    actorUserId: actor.id,
    tenantId,
    ip,
    userAgent,
    details: { role },
  });

  return jsonOk({ ok: true }, { status: 201 });
}
