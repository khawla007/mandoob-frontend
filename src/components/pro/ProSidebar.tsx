'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CalendarClock, LayoutDashboard, Settings, Users } from 'lucide-react';

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

function buildNav(slug: string) {
  const overview: Item[] = [
    { title: 'Overview', href: `/t/${slug}/dashboard`, icon: LayoutDashboard },
  ];
  const workspace: Item[] = [
    { title: 'Team', href: `/t/${slug}/team`, icon: Users },
    { title: 'Clients', href: `/t/${slug}/clients`, icon: Briefcase },
    { title: 'Renewals', href: `/t/${slug}/renewals`, icon: CalendarClock },
    { title: 'Settings', href: `/t/${slug}/settings`, icon: Settings },
  ];
  return { overview, workspace };
}

export function ProSidebar({
  tenantSlug,
  tenantName,
  email,
}: {
  tenantSlug: string;
  tenantName: string;
  email: string | null;
}) {
  const pathname = usePathname();
  const { overview, workspace } = buildNav(tenantSlug);
  const initials = (email ?? 'P').slice(0, 1).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md font-semibold">
            {tenantName.slice(0, 1).toUpperCase()}
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">{tenantName}</div>
            <div className="text-muted-foreground text-xs">PRO workspace</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {overview.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspace.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
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
            <div className="truncate text-sm font-medium">{email ?? 'PRO'}</div>
            <div className="text-muted-foreground text-xs">pro</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(item.href + '/');
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
