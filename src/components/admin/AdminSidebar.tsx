'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Monitor, ScrollText, ShieldCheck, Users } from 'lucide-react';

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

type Item = { title: string; href: string; icon: React.ComponentType<{ className?: string }> };

const overview: Item[] = [{ title: 'Overview', href: '/admin', icon: LayoutDashboard }];

const auth: Item[] = [
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Sessions', href: '/admin/sessions', icon: Monitor },
  { title: 'MFA & Security', href: '/admin/security', icon: ShieldCheck },
  { title: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
];

const tenants: Item[] = [{ title: 'PRO firms', href: '/admin/pro-firms', icon: Building2 }];

export function AdminSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const initials = (email ?? 'A').slice(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md font-semibold">
            M
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold tracking-tight">Mandoob</div>
            <div className="text-muted-foreground text-xs">Super Admin</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {overview.map((item) => (
                <Item key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Auth</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {auth.map((item) => (
                <Item key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tenants</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tenants.map((item) => (
                <Item key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium">{email ?? 'Admin'}</div>
            <div className="text-muted-foreground text-xs">super_admin</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Item({ item, pathname }: { item: Item; pathname: string }) {
  const Icon = item.icon;
  const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
        <Link href={item.href}>
          <Icon className="size-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
