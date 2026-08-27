'use client';

import { useRef, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { setLocaleAction } from '@/lib/i18n/actions';
import { locales, localeLabels, type Locale } from '@/lib/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Languages } from 'lucide-react';

type LanguageSwitcherProps = {
  pathToRevalidate?: string;
  failureMessage?: string;
  pendingLabel?: string;
  className?: string;
};

export function LanguageSwitcher({
  pathToRevalidate = '/',
  failureMessage,
  pendingLabel,
  className,
}: LanguageSwitcherProps) {
  const current = useLocale() as Locale;
  const t = useTranslations('common');
  const tSite = useTranslations('site');
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const resolvedFailureMessage = failureMessage ?? tSite('languageChangeFailed');
  const resolvedPendingLabel = pendingLabel ?? tSite('languageChanging');

  const onSelect = (next: Locale) => {
    if (next === current || submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        await setLocaleAction(next, pathToRevalidate);
        // Hard reload so server-rendered locale + dir are picked up.
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } catch {
        toast.error(resolvedFailureMessage);
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={
            pending ? resolvedPendingLabel : `${localeLabels[current]} — ${t('language')}`
          }
          aria-busy={pending}
          disabled={pending}
          className={cn('gap-2', className)}
        >
          <Languages className="size-4" />
          <span className="hidden sm:inline">
            {pending ? resolvedPendingLabel : localeLabels[current]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onSelect={() => onSelect(loc)}
            disabled={pending}
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
