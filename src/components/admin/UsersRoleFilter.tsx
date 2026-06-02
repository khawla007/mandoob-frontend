'use client';

import { useTranslations } from 'next-intl';
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

export function UsersRoleFilter({ viewerRole, initial }: { viewerRole: Role; initial: Role[] }) {
  const t = useTranslations('admin');
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });

  // Both platform roles (super_admin, admin) see all 5 role buckets. The
  // /admin/users page already gates entry; non-platform viewers never reach here.
  void viewerRole;
  const selectable: Role[] = [...ROLES];

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
          <span>{t('user.filters.rolesLabel')}</span>
          {initial.length > 0 && (
            <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
              {initial.length}
            </Badge>
          )}
          {pending && <span className="text-muted-foreground ml-2 text-xs">…</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{t('user.filters.filterByRole')}</DropdownMenuLabel>
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
              <span>{t(`enums.role.${r}`)}</span>
            </button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
