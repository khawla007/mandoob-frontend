import type { CSSProperties, ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  DashboardSidebar,
  type DashboardSidebarUser,
  type DashboardNavKind,
} from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';

const SIGNAL_STUDIO_SIDEBAR_STYLE = {
  '--sidebar-width': '12.25rem',
  '--sidebar-width-icon': '5.125rem',
} as CSSProperties;

export type DashboardLayoutProps = {
  navKind: DashboardNavKind;
  navSlug?: string;
  brand: string;
  brandSubtitle?: string;
  brandHref: string;
  brandInitial: string;
  brandLogoUrl?: string | null;
  user: DashboardSidebarUser;
  search?: ReactNode;
  breadcrumbs?: ReactNode;
  children: ReactNode;
};

export function DashboardLayout({
  navKind,
  navSlug,
  brand,
  brandSubtitle,
  brandHref,
  brandInitial,
  brandLogoUrl,
  user,
  search,
  breadcrumbs,
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider
      className="dashboard-surface"
      data-nav-kind={navKind}
      style={navKind === 'pro' ? SIGNAL_STUDIO_SIDEBAR_STYLE : undefined}
    >
      <DashboardSidebar
        brand={brand}
        brandSubtitle={brandSubtitle}
        brandHref={brandHref}
        brandInitial={brandInitial}
        brandLogoUrl={brandLogoUrl}
        navKind={navKind}
        navSlug={navSlug}
        user={user}
      />
      <SidebarInset>
        <DashboardTopbar breadcrumbs={breadcrumbs} search={search} />
        <div id="main-content" className="dashboard-main flex-1 p-6 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
