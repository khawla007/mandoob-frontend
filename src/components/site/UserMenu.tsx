'use client';

import Link from 'next/link';
import { LayoutDashboard, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogoutMenuItem } from '@/components/shell/LogoutButton';
import type { Role } from '@/lib/auth/roles';

function initialOf(displayName: string | null, email: string | null): string {
  const source = displayName?.trim() || email?.trim() || '';
  return source.slice(0, 1).toUpperCase() || '?';
}

export function UserMenu({
  email,
  displayName,
  role,
  homeHref,
}: {
  email: string | null;
  displayName: string | null;
  role: Role | null;
  homeHref: string;
}) {
  const isCustomer = role === 'customer';
  const href = isCustomer ? '/account' : homeHref;
  const label = isCustomer ? 'My account' : 'Dashboard';
  const Icon = isCustomer ? User : LayoutDashboard;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="focus-visible:ring-ring rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
            {initialOf(displayName, email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{displayName ?? 'Signed in'}</span>
          {email && (
            <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={href} className="cursor-pointer">
            <Icon className="size-4" />
            {label}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <LogoutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
