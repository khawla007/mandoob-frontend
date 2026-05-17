/**
 * Server-only locale resolution.
 *
 * Resolution order (per Step 29a plan):
 *   1. profiles.locale (signed-in user)
 *   2. NEXT_LOCALE cookie
 *   3. Accept-Language header
 *   4. defaultLocale
 *
 * `parseAcceptLanguage` is exported so tests can exercise the parser without
 * fabricating a request.
 */

import 'server-only';

import { cache } from 'react';

import {
  coerceLocale,
  defaultLocale,
  isSupportedLocale,
  locales,
  NEXT_LOCALE_COOKIE,
  type Locale,
} from './config';

type AcceptLanguageEntry = { tag: string; q: number };

export function parseAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const entries: AcceptLanguageEntry[] = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tag, ...params] = part.split(';').map((p) => p.trim());
      let q = 1;
      for (const param of params) {
        const [key, value] = param.split('=').map((p) => p.trim());
        if (key === 'q' && value) {
          const parsed = Number(value);
          if (!Number.isNaN(parsed)) q = parsed;
        }
      }
      return { tag: tag.toLowerCase(), q };
    });

  entries.sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return null;
}

export type ResolveLocaleInputs = {
  profileLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

export function resolveLocaleFromInputs(inputs: ResolveLocaleInputs): Locale {
  if (isSupportedLocale(inputs.profileLocale)) return inputs.profileLocale;
  if (isSupportedLocale(inputs.cookieLocale)) return inputs.cookieLocale;
  const fromHeader = parseAcceptLanguage(inputs.acceptLanguage);
  if (fromHeader) return fromHeader;
  return defaultLocale;
}

/**
 * Read the locale for the current request.
 *
 * Signed-in users get `profiles.locale` when present; everyone else falls back
 * to cookie → header → default. Failures to read the profile (no session,
 * Supabase down, etc.) silently degrade — locale is never blocking.
 */
export const getRequestLocale = cache(async function getRequestLocale(): Promise<Locale> {
  const { cookies, headers } = await import('next/headers');
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const cookieLocale = cookieStore.get(NEXT_LOCALE_COOKIE)?.value ?? null;
  const acceptLanguage = headerStore.get('accept-language');

  let profileLocale: string | null = null;
  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      const { data } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', userRes.user.id)
        .maybeSingle();
      profileLocale = (data?.locale as string | null) ?? null;
    }
  } catch {
    profileLocale = null;
  }

  return resolveLocaleFromInputs({ profileLocale, cookieLocale, acceptLanguage });
});

export function listSupportedLocales(): readonly Locale[] {
  return locales;
}

export { coerceLocale };
