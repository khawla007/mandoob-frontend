import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ApiError, errorResponse, jsonOk } from '@/lib/errors';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { verifyProCredentials } from '@/lib/data/pro-credential-verification';
import { isUuid } from '@/lib/util/uuid';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { parseJson } from '@/lib/auth/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  try {
    const session = await requirePlatformOperator();
    if (session.aal !== 'aal2')
      return errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
    const { id } = await params;
    if (!isUuid(id)) return errorResponse('VALIDATION_FAILED', 'Invalid user id', 400);
    const allowed = await consumeRateLimit({
      key: `admin-verify-pro-credentials:${session.id}`,
      ...RATE_LIMITS.authedPerUser,
    });
    if (!allowed) return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);
    const body = z
      .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
      .safeParse(await parseJson<unknown>(request));
    if (!body.success) return errorResponse('VALIDATION_FAILED', 'Invalid request', 400);
    const result = await verifyProCredentials(id, session.id, body.data.expectedUpdatedAt);
    revalidatePath(`/admin/users/${id}/edit`);
    revalidatePath('/admin/users');
    revalidatePath('/admin/companies');
    return jsonOk({ ok: true, changed: result.changed });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('verify-pro-credentials unexpected', error);
    return errorResponse('INTERNAL', 'Could not verify PRO credentials', 500);
  }
}
