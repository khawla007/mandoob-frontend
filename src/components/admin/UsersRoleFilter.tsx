'use client';

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
import { useListFilterNav } from '@/hooks/use-list-filter-nav';

const LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  pro: 'PRO',
  customer: 'Customer',
  employee: 'Employee',
};

export function UsersRoleFilter({ viewerRole, initial }: { viewerRole: Role; initial: Role[] }) {
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });

  const selectable: Role[] =
    viewerRole === 'pro'
      ? (ROLES.filter((r) => r !== 'super_admin' && r !== 'admin') as Role[])
      : [...ROLES];

  function toggle(role: Role) {
    const set = new Set(initial);
    if (set.has(role)) set.delete(role);
    else set.add(role);
    navigate({ roles: set.size === 0 ? null : Array.from(set).join(',') });
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
