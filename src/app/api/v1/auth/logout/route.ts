import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { jsonOk } from '@/lib/errors';
import { getClientIp, getUserAgent } from '@/lib/auth/request';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  const tenantId = (data.user?.app_metadata?.tenant_id as string | undefined) ?? null;

  // Option scope "global" logs out everywhere; matches plan §A.3-a.
  await supabase.auth.signOut({ scope: 'global' });

  await recordAuthEvent({
    kind: 'logout',
    actorUserId: userId,
    tenantId,
    ip,
    userAgent,
  });

  return jsonOk({ ok: true });
}
