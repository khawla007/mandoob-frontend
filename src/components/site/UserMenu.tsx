'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { postJson } from '@/lib/http/post';

function initialOf(displayName: string | null, email: string | null): string {
  const source = displayName?.trim() || email?.trim() || '';
  return source.slice(0, 1).toUpperCase() || '?';
}

export function UserMenu({
  email,
  displayName,
}: {
  email: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await postJson('/api/v1/auth/logout', {});
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

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
          <Link href="/account" className="cursor-pointer">
            <User className="size-4" />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
          disabled={loggingOut}
          className="cursor-pointer"
        >
          <LogOut className="size-4" />
          {loggingOut ? 'Logging out…' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
