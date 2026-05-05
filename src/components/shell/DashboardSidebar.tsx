'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ShellNavGroup } from '@/lib/shell/nav-config';

export type DashboardSidebarUser = {
  email: string | null;
  role: string;
  initials: string;
};

export function DashboardSidebar({
  brand,
  brandSubtitle,
  brandHref,
  brandInitial,
  nav,
  user,
}: {
  brand: string;
  brandSubtitle?: string;
  brandHref: string;
  brandInitial: string;
  nav: ShellNavGroup[];
  user: DashboardSidebarUser;
}) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href={brandHref} className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md font-semibold">
            {brandInitial}
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">{brand}</div>
            {brandSubtitle && <div className="text-muted-foreground text-xs">{brandSubtitle}</div>}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group, idx) => (
          <SidebarGroup key={group.label ?? `group-${idx}`}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          {Icon && <Icon className="size-4" />}
                          <span>{item.label}</span>
                          {item.badge !== undefined && (
                            <Badge variant="secondary" className="ml-auto">
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-8">
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium">{user.email ?? '—'}</div>
            <div className="text-muted-foreground text-xs">{user.role}</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
