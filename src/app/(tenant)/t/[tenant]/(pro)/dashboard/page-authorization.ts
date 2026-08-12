import 'server-only';

import { ApiError } from '@/lib/errors';

type ProDashboardTenant = { id: string; slug: string; name: string; status: string };
type ProDashboardSession = { tenantId: string | null; role: 'pro' };

export type ProDashboardReadAuthorizationDependencies = {
  requirePro(): Promise<ProDashboardSession>;
  resolveTenant(slug: string): Promise<ProDashboardTenant | null>;
  requireActive(tenantId: string): Promise<unknown>;
};

export async function authorizeProDashboardRead(
  slug: string,
  dependencies: ProDashboardReadAuthorizationDependencies,
): Promise<
  | { kind: 'authorized'; tenant: ProDashboardTenant; session: ProDashboardSession }
  | { kind: 'inactive'; tenant: ProDashboardTenant; session: ProDashboardSession }
  | { kind: 'not-found' }
> {
  const session = await dependencies.requirePro();
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) return { kind: 'not-found' };
  if (!session.tenantId || session.tenantId !== tenant.id) {
    return { kind: 'not-found' };
  }
  if (tenant.status !== 'active') return { kind: 'inactive', tenant, session };
  try {
    await dependencies.requireActive(tenant.id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TENANT_INACTIVE') {
      return { kind: 'inactive', tenant, session };
    }
    if (error instanceof ApiError && error.code === 'TENANT_NOT_FOUND')
      return { kind: 'not-found' };
    throw error;
  }
  return { kind: 'authorized', tenant, session };
}
