import { NextRequest } from 'next/server';
import { errorResponse, jsonOk } from '@/lib/errors';
import { consumeRateLimitDecision, rateLimitCorrelationId, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/auth/request';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const correlationId = rateLimitCorrelationId(request.headers.get('x-request-id'));
  const rateLimitDecision = await consumeRateLimitDecision({
    key: `uname:${ip}`,
    ...RATE_LIMITS.authPublicIp,
    routeLabel: 'auth.check-username',
    correlationId,
  });
  if (rateLimitDecision === 'limited') {
    return errorResponse('RATE_LIMITED', 'Too many checks. Slow down.', 429);
  }
  if (rateLimitDecision === 'unavailable') {
    return errorResponse(
      'RATE_LIMIT_UNAVAILABLE',
      'Request protection is temporarily unavailable.',
      503,
    );
  }

  const u = request.nextUrl.searchParams.get('u')?.toLowerCase().trim() ?? '';
  if (!USERNAME_RE.test(u)) {
    return jsonOk({ available: false, reason: 'format' });
  }

  const admin = createSupabaseServiceRoleClient();
  const { count } = await admin
    .from('profiles')
    .select('id', { head: true, count: 'exact' })
    .eq('username', u);

  return jsonOk({ available: (count ?? 0) === 0, reason: null });
}
