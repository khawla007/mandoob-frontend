import { ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar, type DashboardSidebarUser } from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';
import type { ShellNavGroup } from '@/lib/shell/nav-config';

export type DashboardLayoutProps = {
  nav: ShellNavGroup[];
  brand: string;
  brandSubtitle?: string;
  brandHref: string;
  brandInitial: string;
  user: DashboardSidebarUser;
  search?: ReactNode;
  breadcrumbs?: ReactNode;
  children: ReactNode;
};

export function DashboardLayout({
  nav,
  brand,
  brandSubtitle,
  brandHref,
  brandInitial,
  user,
  search,
  breadcrumbs,
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <DashboardSidebar
        brand={brand}
        brandSubtitle={brandSubtitle}
        brandHref={brandHref}
        brandInitial={brandInitial}
        nav={nav}
        user={user}
      />
      <SidebarInset>
        <DashboardTopbar breadcrumbs={breadcrumbs} search={search} />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
