'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { coerceLocale, NEXT_LOCALE_COOKIE, type Locale } from './config';

export type SetLocaleResult = { ok: true; locale: Locale } | { ok: false; error: string };

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year

/**
 * Persist a locale choice for the current viewer.
 *
 *  - Signed-in users: writes `profiles.locale` so the choice survives logout
 *    and across devices.
 *  - Everyone: writes the `NEXT_LOCALE` cookie so the next request picks it up
 *    before any database round-trip.
 *
 * `pathToRevalidate` lets callers refresh just the surface that triggered the
 * switch instead of the entire app. Defaults to `/`.
 */
export async function setLocaleAction(
  rawLocale: string,
  pathToRevalidate: string = '/',
): Promise<SetLocaleResult> {
  const locale = coerceLocale(rawLocale);

  // Cookie set must succeed under normal conditions; let exceptions surface.
  const cookieStore = await cookies();
  cookieStore.set({
    name: NEXT_LOCALE_COOKIE,
    value: locale,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
  });

  // Best-effort profile update; never blocks the locale switch for anonymous
  // users or when Supabase is unreachable.
  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      await supabase.from('profiles').update({ locale }).eq('id', userRes.user.id);
    }
  } catch {
    // Swallow — cookie path still works.
  }

  try {
    revalidatePath(pathToRevalidate);
  } catch {
    // revalidatePath can throw when called outside a request scope (tests);
    // safe to ignore.
  }

  return { ok: true, locale };
}
