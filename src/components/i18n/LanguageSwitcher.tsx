'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { setLocaleAction } from '@/lib/i18n/actions';
import { locales, localeLabels, type Locale } from '@/lib/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher({ pathToRevalidate = '/' }: { pathToRevalidate?: string }) {
  const current = useLocale() as Locale;
  const t = useTranslations('common');
  const [pending, startTransition] = useTransition();

  const onSelect = (next: Locale) => {
    if (next === current || pending) return;
    startTransition(async () => {
      await setLocaleAction(next, pathToRevalidate);
      // Hard reload so server-rendered locale + dir are picked up.
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('language')}
          disabled={pending}
          className="gap-2"
        >
          <Languages className="size-4" />
          <span className="hidden sm:inline">{localeLabels[current]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onSelect={() => onSelect(loc)}
            data-active={loc === current}
            className="cursor-pointer"
          >
            {localeLabels[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
