import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Build a response that carries refreshed Supabase auth cookies.
 *
 * Usage inside proxy.ts:
 *   const { response, user } = await updateSession(request);
 *   // tweak response (rewrite URL, inject headers) then return it.
 */
export async function updateSession(
  request: NextRequest,
  initialResponse?: NextResponse,
): Promise<{ response: NextResponse; user: { id: string } | null }> {
  const response = initialResponse ?? NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session. Uses the Auth API, which safely refreshes the token
  // (never rely on getSession() in server code per Supabase docs).
  const { data } = await supabase.auth.getUser();
  return { response, user: data.user ? { id: data.user.id } : null };
}
