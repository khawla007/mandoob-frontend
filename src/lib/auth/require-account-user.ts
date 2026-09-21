import 'server-only';
import { z } from 'zod';
import { getSessionProfile, type SessionProfile } from '@/lib/auth/require-user';

/** Self-account identity only. A PRO result deliberately carries no company authority. */
export async function requireAccountUser(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session || !z.string().uuid().safeParse(session.id).success)
    throw new Error('UNAUTHENTICATED');
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data: profile, error } = await createSupabaseServiceRoleClient()
    .from('profiles')
    .select('role, status, tenant_id, mfa_enrolled_at')
    .eq('id', session.id)
    .maybeSingle();
  if (error || !profile || profile.status !== 'active') throw new Error('ACCESS_DENIED');
  const freshSession = { ...session, mfaEnrolled: Boolean(profile.mfa_enrolled_at) };
  if (profile.role === 'pro') {
    if (profile.tenant_id !== null && !z.string().uuid().safeParse(profile.tenant_id).success)
      throw new Error('ACCESS_DENIED');
    return { ...freshSession, role: 'pro', tenantId: null };
  }
  // Other roles retain their existing authoritative platform/tenant eligibility.
  const { getAuthoritativeSessionProfile } = await import('@/lib/auth/require-role');
  const authoritative = await getAuthoritativeSessionProfile({
    getSession: async () => freshSession,
  });
  if (!authoritative) throw new Error('ACCESS_DENIED');
  // The delegated lookup can observe a concurrent role change. Account identity
  // must never inherit company authority, including a newly observed PRO role.
  return authoritative.role === 'pro' ? { ...authoritative, tenantId: null } : authoritative;
}
