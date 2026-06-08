import type { Locale } from '@/i18n/routing';

export type { Locale };

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
