'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/admin/ThemeToggle';

const TITLES: Record<string, string> = {
  admin: 'Overview',
  users: 'Users',
  sessions: 'Sessions',
  security: 'MFA & Security',
  'audit-logs': 'Audit Logs',
};

export function AdminTopbar() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1 text-sm"
      >
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const href = '/' + segments.slice(0, i + 1).join('/');
          const label = TITLES[seg] ?? seg;
          return (
            <span key={href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" />}
              {isLast ? (
                <span className="text-foreground font-medium">{label}</span>
              ) : (
                <Link href={href} className="hover:text-foreground">
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search users, sessions…"
            className="h-9 w-64 pl-8"
            aria-label="Search"
          />
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
