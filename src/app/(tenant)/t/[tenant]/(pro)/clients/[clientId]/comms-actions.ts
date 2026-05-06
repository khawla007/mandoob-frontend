'use server';

import { requireRole } from '@/lib/auth/require-role';
import { getCommsForClient, type CommRow } from '@/lib/data/comms';
import { getClientForTenant } from '@/lib/data/client-detail';

export async function loadOlderCommsAction(
  tenantId: string,
  clientId: string,
  beforeIso: string,
): Promise<CommRow[]> {
  const session = await requireRole('pro', 'admin', 'super_admin');
  // Tenant scope check: caller's tenant_id must match unless cross-tenant role.
  if (session.role !== 'super_admin' && session.role !== 'admin') {
    if (session.tenantId !== tenantId) return [];
  }
  // Client must exist within the tenant scope.
  const client = await getClientForTenant(tenantId, clientId);
  if (!client) return [];
  return getCommsForClient(tenantId, clientId, { before: beforeIso, limit: 25 });
}
