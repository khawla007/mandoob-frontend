'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { dirOf, coerceLocale } from '@/lib/i18n/config';
import { buildShellBreadcrumbs, type DashboardBreadcrumb } from '@/lib/shell/nav-config';
import { resolveDashboardNav, type DashboardNavKind } from '@/lib/shell/dashboard-navigation-model';
import { buildDashboardAccountLinks } from '@/lib/shell/dashboard-account-model';
import { DashboardCommand } from './DashboardCommand';
import { DashboardAccountMenu } from './DashboardAccountMenu';
import { DashboardNotifications, type DashboardNotificationState } from './DashboardNotifications';
import type { DashboardSidebarUser } from './DashboardSidebar';

export function DashboardTopbar({
  navKind,
  navSlug,
  brand,
  brandHref,
  user,
  breadcrumbs,
  notifications,
  search,
}: {
  navKind: DashboardNavKind;
  navSlug?: string;
  brand: string;
  brandHref: string;
  user: DashboardSidebarUser;
  breadcrumbs?: DashboardBreadcrumb[];
  notifications?: DashboardNotificationState;
  search?: ReactNode;
}) {
  const pathname = usePathname();
  const locale = coerceLocale(useLocale());
  const isRtl = dirOf(locale) === 'rtl';
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  const t = useTranslations('shell');
  const translate = (key: string | undefined, fallback: string | undefined) =>
    key ? t(key) : (fallback ?? '');
  const crumbs =
    breadcrumbs ??
    buildShellBreadcrumbs(
      resolveDashboardNav(navKind, navSlug),
      pathname,
      {
        label: brand,
        href: brandHref,
      },
      translate,
    );
  const notificationState = notifications ?? {
    status: 'unavailable' as const,
    label: t('notificationsUnavailable'),
  };
  const accountLinks = buildDashboardAccountLinks(navKind, navSlug);

  return (
    <header
      data-route-progress-anchor
      className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur max-[240px]:gap-2 max-[240px]:px-2"
    >
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5 max-[240px]:hidden" />
      <nav
        aria-label={t('breadcrumb')}
        className="text-muted-foreground flex min-w-0 items-center gap-1 overflow-hidden text-sm max-[240px]:hidden"
      >
        {crumbs.map((crumb, index) => (
          <span
            key={`${crumb.href ?? 'current'}:${crumb.label}`}
            className="flex min-w-0 items-center gap-1"
          >
            {index > 0 ? <Chevron className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="hover:text-foreground truncate"
                title={crumb.label}
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className="text-foreground truncate font-medium"
                title={crumb.label}
                aria-current="page"
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="ms-auto flex shrink-0 items-center gap-2 max-[240px]:gap-1">
        {search}
        <DashboardCommand navKind={navKind} navSlug={navSlug} />
        <DashboardNotifications state={notificationState} />
        <LanguageSwitcher pathToRevalidate={pathname} />
        <ThemeToggle />
        <DashboardAccountMenu user={user} links={accountLinks} />
      </div>
    </header>
  );
}
