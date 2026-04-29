'use client';

import { useState, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TenantSummary } from '@/lib/data/tenants';
import { useListFilterNav } from '@/hooks/use-list-filter-nav';

export function UsersTenantFilter({
  tenants,
  initial,
}: {
  tenants: TenantSummary[];
  initial: string | null;
}) {
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tenants;
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle),
    );
  }, [filter, tenants]);

  function set(id: string | null) {
    navigate({ tenant: id });
  }

  const currentName = initial ? tenants.find((t) => t.id === initial)?.name : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Building2 className="size-3" />
          <span className="max-w-[10rem] truncate">{currentName ?? 'All tenants'}</span>
          {pending && <span className="text-muted-foreground ml-2 text-xs">…</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <DropdownMenuLabel>Filter by tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search tenants…"
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto pb-1">
          <button
            type="button"
            onClick={() => set(null)}
            className="hover:bg-accent flex w-full items-center px-2 py-1.5 text-sm"
          >
            All tenants
          </button>
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set(t.id)}
              className="hover:bg-accent flex w-full flex-col items-start px-2 py-1.5 text-sm"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-muted-foreground font-mono text-[10px]">/{t.slug}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-muted-foreground px-2 py-2 text-xs">No matches.</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
