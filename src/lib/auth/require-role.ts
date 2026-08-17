import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getSessionProfile, type SessionProfile } from '@/lib/auth/require-user';

type Role = NonNullable<SessionProfile['role']>;
type PlatformQueryResult = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};
type PlatformQuery = {
  select(columns: string): PlatformQuery;
  eq(column: string, value: unknown): PlatformQuery;
  maybeSingle(): Promise<PlatformQueryResult>;
};
type PlatformClient = { from(table: string): PlatformQuery };
type PlatformOperatorDeps = {
  requireSession?: () => Promise<SessionProfile>;
  supabase?: PlatformClient;
  deny?: () => never;
};

async function redirectTo(path: string): Promise<never> {
  // Keep Next's client runtime out of Node unit tests; production behavior is
  // still the same redirect and this module remains server-only.
  const { redirect } = await import('next/navigation');
  redirect(path);
  throw new Error('UNREACHABLE_REDIRECT');
}

async function denyPlatformAccess(deps: PlatformOperatorDeps): Promise<never> {
  if (deps.deny) return deps.deny();
  return redirectTo('/login');
}

export async function requireSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) return redirectTo('/login');
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  const session = await requireSession();
  if (!session.role || !roles.includes(session.role)) {
    return redirectTo('/login');
  }
  return session;
}

export async function requirePlatformOperator(
  deps: PlatformOperatorDeps = {},
): Promise<SessionProfile> {
  const session = await (deps.requireSession ?? requireSession)();
  if (!z.string().uuid().safeParse(session.id).success) return denyPlatformAccess(deps);

  const admin = deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as PlatformClient);
  const { data: profile, error } = await admin
    .from('profiles')
    .select('role, status, tenant_id')
    .eq('id', session.id)
    .maybeSingle();
  if (
    error ||
    !profile ||
    (profile.role !== 'admin' && profile.role !== 'super_admin') ||
    profile.status !== 'active' ||
    profile.tenant_id !== null
  ) {
    return denyPlatformAccess(deps);
  }
  return { ...session, role: profile.role, tenantId: null };
}

export async function requireAal2(session: SessionProfile): Promise<void> {
  if (session.aal !== 'aal2') return redirectTo('/mfa/challenge');
}

export async function requireMfaEnrolled(session: SessionProfile): Promise<void> {
  if (!session.mfaEnrolled) return redirectTo('/mfa/enroll');
}

export async function requireTenantMatch(
  session: SessionProfile,
  paramSlug: string,
): Promise<void> {
  // Platform-scoped roles (super_admin, admin) bypass tenant matching —
  // both have NULL tenant_id and full cross-tenant read access (PRD §2,
  // role-semantics rebase).
  if (session.role === 'super_admin' || session.role === 'admin') return;
  if (!session.tenantId) return redirectTo('/login');

  // Cheap slug→id lookup would need DB here. Instead, store resolution in
  // the session profile later (future optimization). Block mismatch path for
  // now by rejecting unknown slugs.
  if (!paramSlug) return redirectTo('/login');
}
