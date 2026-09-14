import { NextRequest, NextResponse } from 'next/server';
import { sharedSafeDestination } from '@/lib/auth/safe-redirect';
import { trustedApplicationUrl } from '@/lib/auth/trusted-app-origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import {
  createRecoveryContextValue,
  RECOVERY_CONTEXT_COOKIE_NAME,
  recoveryContextCookieOptions,
} from '@/lib/auth/recovery-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Supabase email-link callback. Exchanges the PKCE code in the URL for a session.
 * Supabase sends users here after clicking password-reset or magic-link emails.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const failedRedirect = () => {
    const response = NextResponse.redirect(trustedApplicationUrl('/login?error=callback_failed'));
    response.cookies.delete(RECOVERY_CONTEXT_COOKIE_NAME);
    return response;
  };

  if (!code) return failedRedirect();

  let recoveryUserId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failedRedirect();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return failedRedirect();
    recoveryUserId = data.user.id;
  } catch {
    return failedRedirect();
  }

  const destination = sharedSafeDestination(url.searchParams.get('next'));
  if (!recoveryUserId) return failedRedirect();
  const response = NextResponse.redirect(trustedApplicationUrl(destination));
  if (destination === '/reset-password') {
    response.cookies.set(
      RECOVERY_CONTEXT_COOKIE_NAME,
      createRecoveryContextValue(recoveryUserId, env.SUPABASE_SERVICE_ROLE_KEY),
      recoveryContextCookieOptions,
    );
  } else {
    response.cookies.delete(RECOVERY_CONTEXT_COOKIE_NAME);
  }
  return response;
}
