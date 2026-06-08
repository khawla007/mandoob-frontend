'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LanguageSwitcher() {
  const t = useTranslations('languageSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const switchTo = (nextLocale: (typeof routing.locales)[number]) => {
    if (nextLocale === locale) return;
    const query = Object.fromEntries(params.entries());
    startTransition(() => {
      router.replace({ pathname, query }, { locale: nextLocale });
    });
  };

  return (
    <div
      className="bg-muted text-muted-foreground inline-flex rounded-full p-0.5 text-xs"
      role="group"
      aria-label={t('label')}
    >
      {routing.locales.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 transition-colors ${
              active ? 'bg-background text-foreground shadow-xs' : 'hover:text-foreground'
            }`}
          >
            {code === 'en' ? t('english') : t('arabic')}
          </button>
        );
      })}
    </div>
  );
}
