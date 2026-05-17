import { getRequestConfig } from 'next-intl/server';

import { getRequestLocale } from '@/lib/i18n/server';
import { defaultLocale } from '@/lib/i18n/config';

/**
 * next-intl server config. Resolves the request locale (profile → cookie →
 * Accept-Language → default) and loads the matching messages bundle.
 */
export default getRequestConfig(async () => {
  const locale = await getRequestLocale().catch(() => defaultLocale);
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
