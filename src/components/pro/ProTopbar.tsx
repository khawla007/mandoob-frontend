'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/admin/ThemeToggle';

const SEGMENT_TITLES: Record<string, string> = {
  dashboard: 'Overview',
  team: 'Team',
  clients: 'Clients',
  renewals: 'Renewals',
  settings: 'Settings',
};

export function ProTopbar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();
  // pathname example: /t/firm/dashboard
  const parts = pathname.split('/').filter(Boolean); // ['t', 'firm', 'dashboard']
  const last = parts[parts.length - 1] ?? '';
  const pageTitle = SEGMENT_TITLES[last] ?? last;

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1 text-sm"
      >
        <Link href={`/t/${parts[1] ?? ''}/dashboard`} className="hover:text-foreground">
          {tenantName}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{pageTitle}</span>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search clients, team…"
            className="h-9 w-64 pl-8"
            aria-label="Search"
          />
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
