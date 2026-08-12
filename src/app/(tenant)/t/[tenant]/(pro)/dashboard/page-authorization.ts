import 'server-only';

import { ApiError } from '@/lib/errors';

type ProDashboardTenant = { id: string; slug: string; name: string };
type ProDashboardSession = { tenantId: string | null; role: 'pro' };

export type ProDashboardReadAuthorizationDependencies = {
  requirePro(): Promise<ProDashboardSession>;
  resolveTenant(slug: string): Promise<ProDashboardTenant | null>;
  requireActive(tenantId: string): Promise<unknown>;
};

export async function authorizeProDashboardRead(
  slug: string,
  dependencies: ProDashboardReadAuthorizationDependencies,
): Promise<{ tenant: ProDashboardTenant; session: ProDashboardSession } | null> {
  const session = await dependencies.requirePro();
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) return null;
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await dependencies.requireActive(tenant.id);
  return { tenant, session };
}
