'use server';

import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getCommsForClient, type CommRow } from '@/lib/data/comms';
import { getClientForTenant } from '@/lib/data/client-detail';

export async function loadOlderCommsAction(
  slug: string,
  clientId: string,
  beforeIso: string,
): Promise<CommRow[]> {
  const { tenant } = await requireProTenantRouteAccess(slug);
  // Client must exist within the tenant scope.
  const client = await getClientForTenant(tenant.id, clientId);
  if (!client) return [];
  return getCommsForClient(tenant.id, clientId, { before: beforeIso, limit: 25 });
}
