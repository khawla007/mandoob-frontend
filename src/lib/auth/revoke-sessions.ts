import 'server-only';
import { env } from '@/lib/env';

/**
 * Revoke every refresh token of `userId` so all of their sessions terminate
 * on next access-token expiry (≤ 1 minute given the standard JWT TTL).
 *
 * The Supabase JS SDK's `auth.admin.signOut` only accepts a JWT — not a
 * userId — so we hit the GoTrue admin REST endpoint directly with the
 * service-role key.
 *
 * https://supabase.com/docs/reference/auth/auth-admin-signout
 *   POST /auth/v1/admin/users/{user_id}/logout  body: { scope: 'global' }
 *
 * Throws on any non-2xx response. Callers MUST treat this as required, not
 * best-effort: a failed revoke leaves an admin-demoted user with their old
 * privileges in their existing session for the remaining JWT TTL.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}/logout`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope: 'global' }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`revokeAllSessions failed: ${res.status} ${detail}`);
  }
}
