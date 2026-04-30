import type { NextRequest } from 'next/server';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { requireRole } from '@/lib/auth/require-role';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { changeRoleSchema } from '@/lib/validation/admin-user';
import { adminChangeRole } from '@/lib/data/admin-change-role';
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
    if (!isUuid(id)) {
      return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);
    }
    const ok = await consumeRateLimit({
      key: `admin-change-role:${session.id}`,
      ...RATE_LIMITS.authedPerUser,
    });
    if (!ok) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);

    const raw = await parseJson<unknown>(request);
    const parsed = changeRoleSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', 'Invalid request', 400, {
        issues: parsed.error.issues,
      } as Record<string, unknown>);
    }
    await adminChangeRole(id, parsed.data, {
      caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return jsonOk({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    console.error('admin-change-role unexpected', e);
    return errorResponse('INTERNAL', e instanceof Error ? e.message : 'Unexpected error', 500);
  }
}
