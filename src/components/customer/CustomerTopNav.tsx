'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, CalendarClock, ShieldAlert, User } from 'lucide-react';

type Item = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};

function buildNav(slug: string): Item[] {
  return [
    { label: 'Overview', href: `/t/${slug}/portal`, icon: LayoutDashboard },
    { label: 'Documents', href: `/t/${slug}/portal/documents`, icon: FileText },
    { label: 'Meetings', href: `/t/${slug}/portal/meetings`, icon: CalendarClock },
    { label: 'Renewals', href: `/t/${slug}/portal/renewals`, icon: CalendarClock },
    { label: 'Erasure', href: `/t/${slug}/portal/account/erasure`, icon: ShieldAlert },
    { label: 'Profile', href: '/account', icon: User, external: true },
  ];
}

export function CustomerTopNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const items = buildNav(slug);

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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
