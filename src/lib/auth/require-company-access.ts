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
    const { data: assignment, error } = await admin
      .from('pro_company_assignments')
      .select('id')
      .eq('pro_profile_id', session.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !assignment) return denyAccess(deps);
    return { ...session, role: 'pro', tenantId };
  }

  if ((role === 'customer' || role === 'employee') && authoritativeTenantId === tenantId) {
    return { ...session, role, tenantId };
  }

  return denyAccess(deps);
}
