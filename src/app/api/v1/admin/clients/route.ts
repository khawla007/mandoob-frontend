import type { NextRequest } from 'next/server';
import { errorResponse, jsonOk } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { listClientsForTenant } from '@/lib/data/clients';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await requireRole('super_admin', 'admin');
  // Match the create-user write route's MFA posture so the typeahead can't be
  // used as a downgrade-attack vector to enumerate client names without AAL2.
  if (session.aal !== 'aal2') {
    return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
  }

  const ok = await consumeRateLimit({
    key: `admin-clients:${session.id}`,
    ...RATE_LIMITS.authedPerUser,
  });
  if (!ok) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);

  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');
  const q = url.searchParams.get('q') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!tenantId || !isUuid(tenantId)) {
    return errorResponse('VALIDATION_FAILED', 'tenantId required (uuid)', 400);
  }
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 50)) {
    return errorResponse('VALIDATION_FAILED', 'limit out of range', 400);
  }
  // Post role-rebase: admin is platform-scoped (NULL tenant) and may look up
  // clients across any tenant, same as super_admin. No tenant gating here.

  const rows = await listClientsForTenant({ tenantId, q, limit });
  return jsonOk({ rows });
}
