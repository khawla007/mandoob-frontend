import 'server-only';
import { createHash } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type AuthEventKind =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_changed'
  | 'mfa_enrolled'
  | 'mfa_challenge_success'
  | 'mfa_challenge_failure'
  | 'mfa_reset'
  | 'mfa_factor_removed'
  | 'invite_created'
  | 'invite_accepted'
  | 'admin_created'
  | 'admin_user_edited'
  | 'admin_user_role_changed'
  | 'admin_user_status_changed'
  | 'profile_self_edited'
  | 'session_revoked'
  | 'impersonation_started'
  | 'impersonation_ended'
  | 'tenant_provisioned'
  | 'tenant_self_serve_submitted'
  | 'tenant_approved'
  | 'tenant_rejected'
  | 'tenant_suspended'
  | 'tenant_reactivated';

export type AuthEventInput = {
  kind: AuthEventKind;
  actorUserId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
};

function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const [a, b, c] = ip.split('.');
    return `${a}.${b}.${c}.0`;
  }
  // IPv6 — zero out last 64 bits. Don't keep a second :: (invalid INET syntax).
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4).filter(Boolean);
    while (parts.length < 4) parts.push('0');
    return `${parts.join(':')}::`;
  }
  return null;
}

function hashEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

function redactDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === 'email' && typeof value === 'string') {
      safe.email_hash = hashEmail(value);
      continue;
    }
    if (key === 'password' || key === 'token' || key === 'token_hash') continue;
    safe[key] = value;
  }
  return safe;
}

export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const truncated = truncateIp(input.ip);
  const { error } = await admin.from('auth_events').insert({
    kind: input.kind,
    actor_user_id: input.actorUserId ?? null,
    tenant_id: input.tenantId ?? null,
    ip: truncated,
    user_agent: input.userAgent ?? null,
    details: redactDetails(input.details),
  });
  if (error) console.error('auth_events insert failed', error);
}
