'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
import { adminNav } from '@/lib/shell/nav-admin';
import { buildProNav } from '@/lib/shell/nav-pro';
import { buildEmployeeNav } from '@/lib/shell/nav-employee';

export type DashboardSidebarUser = {
  email: string | null;
  role: string;
  initials: string;
};

export type DashboardNavKind = 'admin' | 'pro' | 'employee';

function resolveNav(kind: DashboardNavKind, slug?: string): ShellNavGroup[] {
  switch (kind) {
    case 'admin':
      return adminNav;
    case 'pro':
      return buildProNav(slug ?? '');
    case 'employee':
      return buildEmployeeNav(slug ?? '');
  }
}

export function DashboardSidebar({
  brand,
  brandSubtitle,
  brandHref,
  brandInitial,
  brandLogoUrl,
  navKind,
  navSlug,
  user,
}: {
  brand: string;
  brandSubtitle?: string;
  brandHref: string;
  brandInitial: string;
  brandLogoUrl?: string | null;
  navKind: DashboardNavKind;
  navSlug?: string;
  user: DashboardSidebarUser;
}) {
  const pathname = usePathname();
  const nav = resolveNav(navKind, navSlug);
  const t = useTranslations('shell');

  const translate = (key: string | undefined, fallback: string | undefined) => {
    if (!key) return fallback ?? '';
    try {
      return t(key);
    } catch {
      return fallback ?? key;
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href={brandHref} className="flex items-center gap-2 px-2 py-1.5">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Tenant logos can come from arbitrary configured hosts.
            <img
              src={brandLogoUrl}
              alt=""
              className="bg-background size-8 rounded-md border object-contain"
            />
          ) : (
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md font-semibold">
              {brandInitial}
            </div>
          )}
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">{brand}</div>
            {brandSubtitle && <div className="text-muted-foreground text-xs">{brandSubtitle}</div>}
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group, idx) => {
          const groupLabel = translate(group.labelKey, group.labelFallback);
          return (
            <SidebarGroup key={group.labelKey ?? `group-${idx}`}>
              {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    const label = translate(item.labelKey, item.labelFallback);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={label}>
                          <Link href={item.href}>
                            {Icon && <Icon className="size-4" />}
                            <span>{label}</span>
                            {item.badge !== undefined && (
                              <Badge variant="secondary" className="ms-auto">
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
          );
        })}
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
