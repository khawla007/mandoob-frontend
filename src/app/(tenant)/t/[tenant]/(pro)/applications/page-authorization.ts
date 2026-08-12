import 'server-only';

import { ApiError } from '@/lib/errors';

type TenantIdentity = { id: string; name: string };

export type ApplicationsReadAuthorizationDependencies = {
  requirePro(): Promise<{ tenantId: string | null }>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
};

export async function authorizeApplicationsRead(
  slug: string,
  dependencies: ApplicationsReadAuthorizationDependencies,
): Promise<TenantIdentity | null> {
  const session = await dependencies.requirePro();
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) return null;
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await dependencies.requireActive(tenant.id);
  return tenant;
}
