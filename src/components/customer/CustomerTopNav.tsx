'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, FileText, CalendarClock, ShieldAlert, User } from 'lucide-react';

type Item = {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};

function buildNav(slug: string): Item[] {
  return [
    { labelKey: 'overview', href: `/t/${slug}/portal`, icon: LayoutDashboard },
    { labelKey: 'documents', href: `/t/${slug}/portal/documents`, icon: FileText },
    { labelKey: 'meetings', href: `/t/${slug}/portal/meetings`, icon: CalendarClock },
    { labelKey: 'renewals', href: `/t/${slug}/portal/renewals`, icon: CalendarClock },
    { labelKey: 'erasure', href: `/t/${slug}/portal/account/erasure`, icon: ShieldAlert },
    { labelKey: 'profile', href: '/account', icon: User, external: true },
  ];
}

export function CustomerTopNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const items = buildNav(slug);
  const tShell = useTranslations('shell');
  const tCommon = useTranslations('common');

  const labelFor = (key: string) => {
    if (key === 'profile') return tCommon('profile');
    return tShell(key);
  };

  return (
    <nav className="border-border/60 -mx-6 mb-6 flex gap-1 overflow-x-auto border-b px-6 text-sm">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          !item.external && (pathname === item.href || pathname.startsWith(item.href + '/'));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              'flex items-center gap-2 border-b-2 px-3 py-3 transition-colors ' +
              (active
                ? 'border-primary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent')
            }
          >
            <Icon className="size-4" />
            {labelFor(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
