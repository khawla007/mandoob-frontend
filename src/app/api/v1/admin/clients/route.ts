import type { NextRequest } from 'next/server';
import { errorResponse, jsonOk } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { listClientsForTenant } from '@/lib/data/clients';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await requireRole('super_admin', 'admin');
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');
  const q = url.searchParams.get('q') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!tenantId || !UUID_RE.test(tenantId)) {
    return errorResponse('VALIDATION_FAILED', 'tenantId required (uuid)', 400);
  }
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 50)) {
    return errorResponse('VALIDATION_FAILED', 'limit out of range', 400);
  }
  if (session.role === 'admin' && session.tenantId !== tenantId) {
    return errorResponse('FORBIDDEN', 'Cross-tenant lookup denied', 403);
  }

  const rows = await listClientsForTenant({ tenantId, q, limit });
  return jsonOk({ rows });
}
