'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { LogoutButton } from './LogoutButton';

export function DashboardTopbar({
  breadcrumbs,
  search,
}: {
  breadcrumbs?: ReactNode;
  search?: ReactNode;
}) {
  const pathname = usePathname();
  const fallbackCrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((seg, i, arr) => {
      const href = '/' + arr.slice(0, i + 1).join('/');
      const isLast = i === arr.length - 1;
      return (
        <span key={href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" />}
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
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1 text-sm"
      >
        {breadcrumbs ?? fallbackCrumbs}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {search}
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
