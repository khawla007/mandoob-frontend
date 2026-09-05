'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
import { resolveDashboardNav, type DashboardNavKind } from '@/lib/shell/dashboard-navigation-model';

export type DashboardSidebarUser = {
  email: string | null;
  role: string;
  initials: string;
};

export type { DashboardNavKind } from '@/lib/shell/dashboard-navigation-model';

const PRO_SIGNAL_LABEL_KEYS: Record<string, string> = {
  commandCenter: 'signalCommand',
  applications: 'signalCases',
  payments: 'signalFinance',
};

export function DashboardSidebarNavItem({
  item,
  activeHref,
  translate,
  navKind,
}: {
  item: ShellNavGroup['items'][number];
  activeHref: string | null;
  translate: (key: string | undefined, fallback: string | undefined) => string;
  navKind: DashboardNavKind;
}) {
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const childActive = item.children?.some((child) => child.href === activeHref) ?? false;
  const active = activeHref === item.href || childActive;
  const signalLabelKey =
    navKind === 'pro' && item.labelKey ? PRO_SIGNAL_LABEL_KEYS[item.labelKey] : undefined;
  const label = signalLabelKey
    ? translate(signalLabelKey, item.labelFallback)
    : translate(item.labelKey, item.labelFallback);
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
          <Link href={item.href} aria-current={active ? 'page' : undefined}>
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
          inert={!open}
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
  const nav = resolveDashboardNav(navKind, navSlug);
  const activeHref = resolveActiveShellHref(nav, pathname);
  const t = useTranslations('shell');
  const locale = useLocale();

  const translate = (key: string | undefined, fallback: string | undefined) => {
    if (!key) return fallback ?? '';
    return t(key);
  };

  return (
    <Sidebar
      collapsible="icon"
      data-nav-kind={navKind}
      side={locale === 'ar' ? 'right' : 'left'}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <nav aria-label={brand} className="contents">
        <SidebarHeader>
          <Link href={brandHref} className="dashboard-brand flex items-center gap-2 px-2 py-1.5">
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
            <div className="dashboard-brand__copy group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold tracking-tight">{brand}</div>
              {brandSubtitle && (
                <div className="text-muted-foreground text-xs">{brandSubtitle}</div>
              )}
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
                        navKind={navKind}
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
            <div className="dashboard-user__copy min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-medium">{user.email ?? '—'}</div>
              <div className="text-muted-foreground text-xs">{user.role}</div>
            </div>
          </div>
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
