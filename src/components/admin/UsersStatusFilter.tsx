'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
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

type Value = ProfileStatus | 'all';
const OPTIONS: { value: Value; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'disabled', label: 'Disabled' },
];

export function UsersStatusFilter({ initial }: { initial: Value }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(value: Value) {
    const next = new URLSearchParams(params.toString());
    next.delete('cursor');
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    start(() => router.replace(`/admin/users?${next.toString()}`));
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
