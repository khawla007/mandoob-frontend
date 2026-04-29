'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLES, type Role } from '@/lib/auth/roles';

const LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  pro: 'PRO',
  customer: 'Customer',
  employee: 'Employee',
};

export function UsersRoleFilter({ viewerRole, initial }: { viewerRole: Role; initial: Role[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const selectable: Role[] =
    viewerRole === 'pro'
      ? (ROLES.filter((r) => r !== 'super_admin' && r !== 'admin') as Role[])
      : [...ROLES];

  function toggle(role: Role) {
    const set = new Set(initial);
    if (set.has(role)) set.delete(role);
    else set.add(role);
    const next = new URLSearchParams(params.toString());
    next.delete('cursor');
    if (set.size === 0) next.delete('roles');
    else next.set('roles', Array.from(set).join(','));
    start(() => router.replace(`/admin/users?${next.toString()}`));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Filter className="size-3" />
          <span>Roles</span>
          {initial.length > 0 && (
            <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
              {initial.length}
            </Badge>
          )}
          {pending && <span className="text-muted-foreground ml-2 text-xs">…</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {selectable.map((r) => {
          const checked = initial.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className="hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-sm"
            >
              <Checkbox checked={checked} />
              <span>{LABEL[r]}</span>
            </button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
