import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { SessionProfile } from './require-user';

type DbResult = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): Promise<DbResult>;
};
type AccessClient = { from(table: string): Query };
type AccessDeps = {
  requireSession?: () => Promise<SessionProfile>;
  supabase?: AccessClient;
  deny?: () => never;
};

const PLATFORM_ROLES = new Set(['admin', 'super_admin']);
const recordIdSchema = z.string().uuid();

async function denyAccess(deps: AccessDeps): Promise<never> {
  if (deps.deny) return deps.deny();
  const { redirect } = await import('next/navigation');
  redirect('/login');
  throw new Error('UNREACHABLE_REDIRECT');
}

async function loadSession(): Promise<SessionProfile> {
  const { requireSession } = await import('./require-role');
  return requireSession();
}

export async function requireCompanyAccess(
  tenantId: string,
  deps: AccessDeps = {},
): Promise<SessionProfile> {
  return requireScopedCompanyAccess(tenantId, null, true, deps);
}

export async function requireExactCompanyAccess(
  tenantId: string,
  companyId: string,
  deps: AccessDeps = {},
): Promise<SessionProfile> {
  if (!recordIdSchema.safeParse(companyId).success) return denyAccess(deps);
  return requireScopedCompanyAccess(tenantId, companyId, false, deps);
}

async function requireScopedCompanyAccess(
  tenantId: string,
  companyId: string | null,
  allowWorkspaceRoles: boolean,
  deps: AccessDeps,
): Promise<SessionProfile> {
  if (!recordIdSchema.safeParse(tenantId).success) return denyAccess(deps);
  const session = await (deps.requireSession ?? loadSession)();
  if (!recordIdSchema.safeParse(session.id).success) return denyAccess(deps);
  const admin = deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as AccessClient);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, status, tenant_id')
    .eq('id', session.id)
    .maybeSingle();

  if (profileError || !profile) return denyAccess(deps);
  const role = profile.role;
  const status = profile.status;
  const authoritativeTenantId = profile.tenant_id;

  if (role !== session.role || status !== 'active') return denyAccess(deps);

  if (typeof role === 'string' && PLATFORM_ROLES.has(role)) {
    if (authoritativeTenantId !== null) return denyAccess(deps);
    return { ...session, role: role as 'admin' | 'super_admin', tenantId: null };
  }

  if (role === 'pro') {
    let accessQuery = admin
      .from('profiles')
      .select(
        'id, role, status, pro_profiles!pro_profiles_profile_id_fkey!inner(credentials_verified), active_assignments:pro_company_assignments!pro_company_assignments_pro_profile_id_fkey!inner(id)',
      )
      .eq('id', session.id)
      .eq('role', 'pro')
      .eq('status', 'active')
      .eq('pro_profiles.credentials_verified', true)
      .eq('active_assignments.tenant_id', tenantId)
      .eq('active_assignments.status', 'active');
    if (companyId) {
      accessQuery = accessQuery.eq('active_assignments.company_id', companyId);
    }
    const { data: access, error } = await accessQuery.maybeSingle();
    if (error || !access) return denyAccess(deps);
    return { ...session, role: 'pro', tenantId };
  }

  if (
    allowWorkspaceRoles &&
    (role === 'customer' || role === 'employee') &&
    authoritativeTenantId === tenantId
  ) {
    return { ...session, role, tenantId };
  }

  return denyAccess(deps);
}
