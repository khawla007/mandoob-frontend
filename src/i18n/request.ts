import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

const NAMESPACES = [
  'common',
  'home',
  'pricing',
  'estimate',
  'knowledge-base',
  'legal',
  'company-setup',
  'apply',
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = (routing.locales as readonly string[]).includes(requested ?? '')
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(
      async (ns) => [ns, (await import(`@/messages/${locale}/${ns}.json`)).default] as const,
    ),
  );
  const messages = Object.fromEntries(entries);

  return { locale, messages };
});
