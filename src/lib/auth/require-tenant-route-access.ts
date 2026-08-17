import 'server-only';
import { requireCompanyAccess } from './require-company-access';
import { isPlatformOperatorRole, type Role } from './roles';
import { resolveTenantBySlug, type Tenant } from '@/lib/data/tenant';
import type { SessionProfile } from './require-user';

type Dependencies = {
  resolveTenant?: (slug: string) => Promise<Tenant | null>;
  requireAccess?: (tenantId: string) => Promise<SessionProfile>;
  deny?: () => never;
};

function roleAllowed(actual: Role, allowed: readonly Role[]): boolean {
  return (
    allowed.includes(actual) ||
    (isPlatformOperatorRole(actual) && allowed.some(isPlatformOperatorRole))
  );
}

async function deny(deps: Dependencies): Promise<never> {
  if (deps.deny) return deps.deny();
  const { notFound } = await import('next/navigation');
  notFound();
  throw new Error('UNREACHABLE_NOT_FOUND');
}

/** Authoritative boundary for tenant pages, route handlers, and inline server actions. */
export async function requireTenantRouteAccess(
  slug: string,
  allowedRoles: readonly Role[] = ROLES_WITH_TENANT_ACCESS,
  deps: Dependencies = {},
): Promise<{ tenant: Tenant; session: SessionProfile }> {
  const tenant = await (deps.resolveTenant ?? resolveTenantBySlug)(slug);
  if (!tenant) return deny(deps);
  const session = await (deps.requireAccess ?? requireCompanyAccess)(tenant.id);
  if (!session.role || !roleAllowed(session.role, allowedRoles)) return deny(deps);
  return { tenant, session };
}

export async function requireProTenantRouteAccess(
  slug: string,
  deps: Dependencies = {},
): Promise<{ tenant: Tenant; session: SessionProfile & { role: 'pro'; tenantId: string } }> {
  const { tenant, session } = await requireTenantRouteAccess(slug, ['pro'], deps);
  if (!isProTenantSession(session, tenant.id)) return deny(deps);
  return { tenant, session };
}

function isProTenantSession(
  session: SessionProfile,
  tenantId: string,
): session is SessionProfile & { role: 'pro'; tenantId: string } {
  return session.role === 'pro' && session.tenantId === tenantId;
}

const ROLES_WITH_TENANT_ACCESS: readonly Role[] = [
  'admin',
  'super_admin',
  'pro',
  'customer',
  'employee',
];
