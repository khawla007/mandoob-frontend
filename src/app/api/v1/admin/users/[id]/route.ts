import type { NextRequest } from 'next/server';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { requireRole } from '@/lib/auth/require-role';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { editUserSchema } from '@/lib/validation/admin-user';
import { adminEditUser } from '@/lib/data/admin-edit-user';
import { getUserForEdit } from '@/lib/data/admin-read-user';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authedSession() {
  const session = await requireRole('super_admin', 'admin');
  if (session.aal !== 'aal2') {
    throw new ApiError('AAL2_REQUIRED', 'MFA challenge required', 403);
  }
  return session;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authedSession();
    const { id } = await params;
    if (!isUuid(id)) {
      return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);
    }
    const user = await getUserForEdit(id, {
      id: session.id,
      role: session.role!,
      tenantId: session.tenantId,
    });
    return jsonOk({ ok: true, user });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    console.error('admin-read-user unexpected', e);
    return errorResponse('INTERNAL', e instanceof Error ? e.message : 'Unexpected error', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

  try {
    const session = await authedSession();
    const { id } = await params;
    if (!isUuid(id)) {
      return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);
    }
    const ok = await consumeRateLimit({
      key: `admin-edit-user:${session.id}`,
      ...RATE_LIMITS.authedPerUser,
    });
    if (!ok) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);

    const raw = await parseJson<unknown>(request);
    const parsed = editUserSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', 'Invalid request', 400, {
        issues: parsed.error.issues,
      } as Record<string, unknown>);
    }
    const result = await adminEditUser(id, parsed.data, {
      caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return jsonOk({ ok: true, changed_keys: result.changedKeys });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    console.error('admin-edit-user unexpected', e);
    return errorResponse('INTERNAL', e instanceof Error ? e.message : 'Unexpected error', 500);
  }
}
