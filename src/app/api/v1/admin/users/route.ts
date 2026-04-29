import type { NextRequest } from 'next/server';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { requireRole } from '@/lib/auth/require-role';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createUserSchema } from '@/lib/validation/admin-user';
import { adminCreateUser } from '@/lib/data/admin-create-user';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

  const session = await requireRole('super_admin', 'admin');
  // Spec §4 step 2 — do not silently swallow AAL2. Layout's swallow is for UX
  // (page renders, MFA prompt floats); direct POST must reject.
  if (session.aal !== 'aal2') {
    return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
  }

  const ok = await consumeRateLimit({
    key: `admin-create-user:${session.id}`,
    ...RATE_LIMITS.authedPerUser,
  });
  if (!ok) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);

  const raw = await parseJson<unknown>(request);
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', 'Invalid request', 400, {
      issues: parsed.error.issues,
    } as Record<string, unknown>);
  }

  try {
    const result = await adminCreateUser(parsed.data, {
      caller: { id: session.id, role: session.role!, tenantId: session.tenantId },
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    return jsonOk(
      { ok: true, userId: result.userId, auditWarning: result.auditWarning },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    console.error('admin-create-user unexpected', e);
    return errorResponse('INTERNAL', e instanceof Error ? e.message : 'Unexpected error', 500);
  }
}
