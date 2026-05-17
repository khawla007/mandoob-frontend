/**
 * Locale-aware date/time helpers.
 *
 * Callers should pass a `Locale` from `lib/i18n/config`. Existing call sites
 * that did not pass a locale default to `defaultLocale` so behaviour stays
 * unchanged until they migrate.
 */

import { coerceLocale, defaultLocale, localeIntlTags, type Locale } from './config';

export function formatDateTime(
  iso: string | null,
  locale: Locale | string = defaultLocale,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  if (!iso) return '—';
  const safe = coerceLocale(typeof locale === 'string' ? locale : null);
  const tag = localeIntlTags[safe];
  return new Intl.DateTimeFormat(tag, options).format(new Date(iso));
}

export function formatDateShort(iso: string | null, locale: Locale | string = defaultLocale): string {
  return formatDateTime(iso, locale, { year: 'numeric', month: 'short', day: 'numeric' });
}
