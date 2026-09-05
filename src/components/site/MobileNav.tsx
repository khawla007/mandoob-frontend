'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PublicNavLinks } from './PublicNavLinks';
import { PublicThemeToggle } from './PublicThemeToggle';
import type { PublicNavLink } from './public-navigation';

type MobileNavLink = Pick<PublicNavLink, 'href' | 'label'> &
  Partial<Pick<PublicNavLink, 'id' | 'currentPath'>>;

type MobileNavBaseProps = {
  links: readonly MobileNavLink[];
  signInLabel: string;
  ctaLabel: string;
  openMenuLabel?: string;
  closeMenuLabel?: string;
  menuTitle?: string;
  mobileNavLabel?: string;
  languageFailureMessage?: string;
  languagePendingLabel?: string;
};

type MobileNavProps = MobileNavBaseProps &
  (
    | {
        authed: true;
        accountHref: string;
        accountLabel: string;
      }
    | {
        authed: false;
        accountHref?: never;
        accountLabel?: never;
      }
  );

const legacyIdsByHref: Readonly<Record<string, PublicNavLink['id']>> = {
  '/#services': 'platform',
  '/estimate': 'estimate',
  '/#customers': 'customers',
  '/pro': 'forPros',
  '/pricing': 'pricing',
};

function legacyIdFromHref(href: string): PublicNavLink['id'] {
  return (legacyIdsByHref[href] ?? `legacy:${href}`) as PublicNavLink['id'];
}

function normalizeLinks(links: readonly MobileNavLink[]): PublicNavLink[] {
  return links.map((link) => ({
    id: link.id ?? legacyIdFromHref(link.href),
    href: link.href,
    label: link.label,
    currentPath: link.currentPath,
  }));
}

export function MobileNav({
  links,
  authed,
  signInLabel,
  ctaLabel,
  accountHref,
  accountLabel,
  openMenuLabel,
  closeMenuLabel,
  menuTitle,
  mobileNavLabel,
  languageFailureMessage,
  languagePendingLabel,
}: MobileNavProps) {
  const t = useTranslations('site');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const resolvedOpenLabel = openMenuLabel ?? t('openMenu');
  const resolvedCloseLabel = closeMenuLabel ?? t('closeMenu');
  const resolvedTitle = menuTitle ?? t('menuTitle');
  const resolvedNavLabel = mobileNavLabel ?? t('mobileNav');
  const publicLinks = normalizeLinks(links);
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    const timerId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timerId);
  }, [pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };

    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="nav__menu"
          aria-label={open ? resolvedCloseLabel : resolvedOpenLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </DialogTrigger>

      <DialogContent
        className="site-public public-mobile-dialog"
        closeLabel={resolvedCloseLabel}
        aria-describedby={undefined}
      >
        <div className="public-mobile-dialog__inner">
          <DialogTitle className="public-mobile-dialog__title">{resolvedTitle}</DialogTitle>

          <nav className="public-mobile-dialog__nav" aria-label={resolvedNavLabel}>
            <PublicNavLinks links={publicLinks} onNavigate={closeMenu} />
          </nav>

          <div className="public-mobile-dialog__utilities">
            <LanguageSwitcher
              className="public-mobile-dialog__language"
              variant="public"
              failureMessage={languageFailureMessage}
              pendingLabel={languagePendingLabel}
            />
            <PublicThemeToggle />
          </div>

          <div className="public-mobile-dialog__actions">
            {authed ? (
              <Link
                href={accountHref}
                onClick={closeMenu}
                className="public-mobile-dialog__account"
              >
                {accountLabel}
              </Link>
            ) : (
              <Link href="/login" onClick={closeMenu} className="public-mobile-dialog__account">
                {signInLabel}
              </Link>
            )}
            <Link
              className="btn btn--accent public-mobile-dialog__cta"
              href="/estimate"
              onClick={closeMenu}
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
