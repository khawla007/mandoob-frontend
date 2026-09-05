'use client';

import { useRef, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { setLocaleAction } from '@/lib/i18n/actions';
import { dirOf, locales, localeLabels, type Locale } from '@/lib/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, Languages } from 'lucide-react';

type LanguageSwitcherProps = {
  pathToRevalidate?: string;
  failureMessage?: string;
  pendingLabel?: string;
  className?: string;
  variant?: 'default' | 'public';
};

export function LanguageSwitcher({
  pathToRevalidate = '/',
  failureMessage,
  pendingLabel,
  className,
  variant = 'default',
}: LanguageSwitcherProps) {
  const current = useLocale() as Locale;
  const t = useTranslations('common');
  const tSite = useTranslations('site');
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pointerDismissedRef = useRef(false);
  const resolvedFailureMessage = failureMessage ?? tSite('languageChangeFailed');
  const resolvedPendingLabel = pendingLabel ?? tSite('languageChanging');
  const isPublic = variant === 'public';

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
    <DropdownMenu dir={dirOf(current)}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          aria-label={
            pending ? resolvedPendingLabel : `${localeLabels[current]} — ${t('language')}`
          }
          aria-busy={pending}
          disabled={pending}
          className={cn(
            'gap-2',
            isPublic && 'language-switcher__trigger--public',
            className,
          )}
        >
          <Languages className="size-4" />
          <span className={cn(!isPublic && 'hidden sm:inline')}>
            {pending ? resolvedPendingLabel : localeLabels[current]}
          </span>
          {isPublic && <ChevronDown className="size-3.5" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={isPublic ? 8 : undefined}
        className={cn(isPublic && 'language-switcher__content--public')}
        onPointerDownOutside={() => {
          pointerDismissedRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (!pointerDismissedRef.current) return;
          pointerDismissedRef.current = false;
          event.preventDefault();
          triggerRef.current?.blur();
        }}
      >
        <DropdownMenuRadioGroup value={current}>
          {locales.map((loc) => (
            <DropdownMenuRadioItem
              key={loc}
              value={loc}
              onSelect={() => onSelect(loc)}
              disabled={pending}
              data-active={loc === current}
              className={cn(
                'cursor-pointer',
                isPublic && 'language-switcher__item--public',
              )}
            >
              {localeLabels[loc]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
