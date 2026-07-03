'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { resolveActiveShellHref, type ShellNavGroup } from '@/lib/shell/nav-config';
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

function DashboardSidebarNavItem({
  item,
  activeHref,
  translate,
}: {
  item: ShellNavGroup['items'][number];
  activeHref: string | null;
  translate: (key: string | undefined, fallback: string | undefined) => string;
}) {
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const childActive = item.children?.some((child) => child.href === activeHref) ?? false;
  const active = activeHref === item.href || childActive;
  const label = translate(item.labelKey, item.labelFallback);
  const [open, setOpen] = useState(childActive);

  return (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        asChild={!hasChildren}
        isActive={active}
        tooltip={label}
        type={hasChildren ? 'button' : undefined}
        onClick={hasChildren ? () => setOpen((value) => !value) : undefined}
        aria-expanded={hasChildren ? open : undefined}
      >
        {hasChildren ? (
          <>
            {Icon && <Icon className="size-4" />}
            <span>{label}</span>
            <ChevronDown
              className={`ms-auto size-3.5 transition-transform duration-300 ease-in-out group-data-[collapsible=icon]:hidden ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </>
        ) : (
          <Link href={item.href}>
            {Icon && <Icon className="size-4" />}
            <span>{label}</span>
            {item.badge !== undefined && (
              <Badge variant="secondary" className="ms-auto">
                {item.badge}
              </Badge>
            )}
          </Link>
        )}
      </SidebarMenuButton>
      {hasChildren && (
        <div
          aria-hidden={!open}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out group-data-[collapsible=icon]:hidden ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <SidebarMenuSub className="border-l-0 py-1">
              {item.children?.map((child) => {
                const ChildIcon = child.icon;
                const childLabel = translate(child.labelKey, child.labelFallback);
                return (
                  <SidebarMenuSubItem key={child.href}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={activeHref === child.href}
                      aria-current={activeHref === child.href ? 'page' : undefined}
                    >
                      <Link href={child.href}>
                        {ChildIcon && <ChildIcon className="size-3.5" />}
                        <span>{childLabel}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </div>
        </div>
      )}
    </SidebarMenuItem>
  );
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
  const activeHref = resolveActiveShellHref(nav, pathname);
  const t = useTranslations('shell');

  const translate = (key: string | undefined, fallback: string | undefined) => {
    if (!key) return fallback ?? '';
    return t(key);
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
                  {group.items.map((item) => (
                    <DashboardSidebarNavItem
                      key={item.href}
                      item={item}
                      activeHref={activeHref}
                      translate={translate}
                    />
                  ))}
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
