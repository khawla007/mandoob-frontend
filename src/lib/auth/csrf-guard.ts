import 'server-only';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { errorResponse } from '@/lib/errors';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/auth/csrf';

/**
 * Returns null on success, or a 403 Response on mismatch.
 * Call at the top of every state-changing /api/v1/auth/* route.
 */
export async function guardCsrf(request: Request): Promise<Response | null> {
  const header = request.headers.get(CSRF_HEADER_NAME);
  const store = await cookies();
  const cookie = store.get(CSRF_COOKIE_NAME)?.value ?? null;

  if (!header || !cookie) return errorResponse('CSRF_REQUIRED', 'CSRF token missing', 403);
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (a.length !== b.length) return errorResponse('CSRF_MISMATCH', 'CSRF token mismatch', 403);
  if (!timingSafeEqual(a, b)) return errorResponse('CSRF_MISMATCH', 'CSRF token mismatch', 403);
  return null;
}
