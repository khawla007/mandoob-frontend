import type { NextRequest } from 'next/server';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { requireRole } from '@/lib/auth/require-role';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { resyncUserRoleMetadata } from '@/lib/data/admin-resync-role-metadata';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

  try {
    const session = await requireRole('super_admin', 'admin');
    if (session.aal !== 'aal2') {
      return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
    }
    const { id } = await params;
    if (!isUuid(id)) return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);

    const allowed = await consumeRateLimit({
      key: `admin-resync-role-metadata:${session.id}`,
      ...RATE_LIMITS.authedPerUser,
    });
    if (!allowed) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);

    await resyncUserRoleMetadata(
      { id: session.id, role: session.role!, tenantId: session.tenantId },
      id,
    );
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('admin role metadata resync unexpected', error);
    return errorResponse('INTERNAL', 'Could not resynchronize authorization metadata', 500);
  }
}
