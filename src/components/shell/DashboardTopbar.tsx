'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { dirOf, coerceLocale } from '@/lib/i18n/config';
import { LogoutButton } from './LogoutButton';

export function DashboardTopbar({
  breadcrumbs,
  search,
}: {
  breadcrumbs?: ReactNode;
  search?: ReactNode;
}) {
  const pathname = usePathname();
  const locale = coerceLocale(useLocale());
  const isRtl = dirOf(locale) === 'rtl';
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  const t = useTranslations('shell');

  const fallbackCrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((seg, i, arr) => {
      const href = '/' + arr.slice(0, i + 1).join('/');
      const isLast = i === arr.length - 1;
      return (
        <span key={href} className="flex items-center gap-1">
          {i > 0 && <Chevron className="size-3.5" aria-hidden />}
          {isLast ? (
            <span className="text-foreground font-medium capitalize">{seg.replace(/-/g, ' ')}</span>
          ) : (
            <Link href={href} className="hover:text-foreground capitalize">
              {seg.replace(/-/g, ' ')}
            </Link>
          )}
        </span>
      );
    });

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <nav
        aria-label={t('breadcrumb')}
        className="text-muted-foreground flex items-center gap-1 text-sm"
      >
        {breadcrumbs ?? fallbackCrumbs}
      </nav>
      <div className="ms-auto flex items-center gap-2">
        {search}
        <LanguageSwitcher pathToRevalidate={pathname} />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
