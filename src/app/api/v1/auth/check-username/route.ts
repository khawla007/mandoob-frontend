import { NextRequest } from 'next/server';
import { errorResponse, jsonOk } from '@/lib/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/auth/request';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await consumeRateLimit({ key: `uname:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many checks. Slow down.', 429);
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
