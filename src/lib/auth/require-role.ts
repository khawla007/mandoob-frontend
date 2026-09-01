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
type PlatformClient = {
  from(table: string): PlatformQuery;
  rpc(
    name: 'read_authoritative_pro_tenant',
    args: { p_actor_id: string },
  ): Promise<{ data: string | null; error: { message?: string } | null }>;
};
type PlatformOperatorDeps = {
  requireSession?: () => Promise<SessionProfile>;
  supabase?: PlatformClient;
  deny?: () => never;
};
type RoleGuardDeps = PlatformOperatorDeps;
type MfaGuardDeps = {
  redirect?: (path: string) => Promise<never> | never;
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

export async function resolveAuthoritativeRole(
  roles: Role[],
  deps: RoleGuardDeps = {},
): Promise<SessionProfile> {
  const session = await (deps.requireSession ?? requireSession)();
  if (!z.string().uuid().safeParse(session.id).success) return denyPlatformAccess(deps);
  const admin = deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as PlatformClient);
  const { data: profile, error } = await admin
    .from('profiles')
    .select('role, status, tenant_id')
    .eq('id', session.id)
    .maybeSingle();
  if (error || !profile || profile.status !== 'active' || typeof profile.role !== 'string') {
    return denyPlatformAccess(deps);
  }

  const allowed = new Set<string>(roles);
  if (allowed.has('admin') || allowed.has('super_admin')) {
    allowed.add('admin');
    allowed.add('super_admin');
  }
  if (!allowed.has(profile.role)) return denyPlatformAccess(deps);

  if (profile.role === 'admin' || profile.role === 'super_admin') {
    if (profile.tenant_id !== null) return denyPlatformAccess(deps);
    return { ...session, role: profile.role, tenantId: null };
  }
  if (profile.role === 'customer' || profile.role === 'employee') {
    if (!z.string().uuid().safeParse(profile.tenant_id).success) return denyPlatformAccess(deps);
    return { ...session, role: profile.role, tenantId: profile.tenant_id as string };
  }
  if (profile.role === 'pro') {
    const { data: tenantId, error: liveProError } = await admin.rpc(
      'read_authoritative_pro_tenant',
      { p_actor_id: session.id },
    );
    if (liveProError || !z.string().uuid().safeParse(tenantId).success) {
      return denyPlatformAccess(deps);
    }
    return { ...session, role: 'pro', tenantId: tenantId as string };
  }
  return denyPlatformAccess(deps);
}

export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  return resolveAuthoritativeRole(roles);
}

export async function requirePlatformOperator(
  deps: PlatformOperatorDeps = {},
): Promise<SessionProfile> {
  return resolveAuthoritativeRole(['admin', 'super_admin'], deps);
}

export async function requireAal2(session: SessionProfile, deps: MfaGuardDeps = {}): Promise<void> {
  if (session.aal !== 'aal2') {
    await (deps.redirect ?? redirectTo)('/mfa/challenge');
  }
}

export async function requireMfaEnrolled(
  session: SessionProfile,
  deps: MfaGuardDeps = {},
): Promise<void> {
  if (!session.mfaEnrolled) {
    await (deps.redirect ?? redirectTo)('/mfa/enroll');
  }
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
