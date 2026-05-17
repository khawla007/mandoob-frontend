/**
 * Mandoob i18n — locale registry and direction helpers.
 *
 * This file is the single source of truth for which locales the app supports
 * and which direction each one uses. Add a locale here once; the resolver,
 * the language switcher, and the root layout all read it.
 */

export const locales = ['en', 'ar'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

export const localeIntlTags: Record<Locale, string> = {
  en: 'en-AE',
  ar: 'ar-AE',
};

export type Direction = 'ltr' | 'rtl';

const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);

export function dirOf(locale: Locale): Direction {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  if (!value) return false;
  return (locales as readonly string[]).includes(value);
}

export function coerceLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : defaultLocale;
}

export const NEXT_LOCALE_COOKIE = 'NEXT_LOCALE';
