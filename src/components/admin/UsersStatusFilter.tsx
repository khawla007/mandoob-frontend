'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProfileStatus } from '@/lib/data/users';
import { useListFilterNav } from '@/hooks/use-list-filter-nav';

type Value = ProfileStatus | 'all';
const OPTIONS: { value: Value; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'disabled', label: 'Disabled' },
];

export function UsersStatusFilter({ initial }: { initial: Value }) {
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });

  function set(value: Value) {
    navigate({ status: value === 'all' ? null : value });
  }

  const current = OPTIONS.find((o) => o.value === initial)?.label ?? 'All statuses';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <span>{current}</span>
          {pending && <span className="text-muted-foreground ml-2 text-xs">…</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={o.value === initial}
            onCheckedChange={() => set(o.value)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
