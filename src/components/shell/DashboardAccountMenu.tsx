'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DashboardSidebarUser } from './DashboardSidebar';
import type { DashboardAccountLink } from '@/lib/shell/dashboard-account-model';
import { LogoutMenuItem } from './LogoutButton';

const LINK_ICONS = {
  profile: UserRound,
  settings: SlidersHorizontal,
  security: ShieldCheck,
  sessions: ShieldCheck,
  privacy: ShieldCheck,
} as const;

export function DashboardAccountMenu({
  user,
  links,
}: {
  user: DashboardSidebarUser;
  links: DashboardAccountLink[];
}) {
  const t = useTranslations('shell');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-w-9 gap-2" aria-label={t('accountMenu')}>
          <Avatar className="size-7">
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate xl:inline">{user.email ?? '—'}</span>
          <ChevronDown className="hidden size-3.5 xl:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="min-w-0">
          <span className="block truncate text-sm text-current">{user.email ?? '—'}</span>
          <span className="block truncate font-normal">{user.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map((link) => {
          const Icon = LINK_ICONS[link.labelKey];
          return (
            <DropdownMenuItem key={link.href} asChild>
              <Link href={link.href}>
                <Icon className="size-4" aria-hidden="true" />
                {t(link.labelKey)}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <LogoutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
