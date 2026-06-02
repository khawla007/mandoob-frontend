'use client';

import { useTranslations } from 'next-intl';
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
const OPTION_VALUES: Value[] = ['all', 'active', 'invited', 'disabled'];

export function UsersStatusFilter({ initial }: { initial: Value }) {
  const t = useTranslations('admin');
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });

  function set(value: Value) {
    navigate({ status: value === 'all' ? null : value });
  }

  const label = (value: Value) =>
    value === 'all' ? t('user.filters.allStatuses') : t(`enums.status.${value}`);
  const current = label(OPTION_VALUES.includes(initial) ? initial : 'all');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <span>{current}</span>
          {pending && <span className="text-muted-foreground ml-2 text-xs">…</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>{t('user.filters.filterByStatus')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTION_VALUES.map((value) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={value === initial}
            onCheckedChange={() => set(value)}
          >
            {label(value)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
