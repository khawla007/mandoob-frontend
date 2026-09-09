import type { CSSProperties, ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  DashboardSidebar,
  type DashboardSidebarUser,
  type DashboardNavKind,
} from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';
import { DashboardSurfaceScope } from './DashboardSurfaceScope';
import { DashboardSkipLink } from './DashboardSkipLink';
import type { DashboardBreadcrumb } from '@/lib/shell/nav-config';
import type { DashboardNotificationState } from './DashboardNotifications';

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
  breadcrumbs?: DashboardBreadcrumb[];
  notifications?: DashboardNotificationState;
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
  notifications,
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider
      className="dashboard-surface"
      data-nav-kind={navKind}
      style={navKind === 'pro' ? SIGNAL_STUDIO_SIDEBAR_STYLE : undefined}
    >
      <DashboardSurfaceScope />
      <DashboardSkipLink />
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
        <DashboardTopbar
          navKind={navKind}
          navSlug={navSlug}
          brand={brand}
          brandHref={brandHref}
          user={user}
          breadcrumbs={breadcrumbs}
          notifications={notifications}
          search={search}
        />
        <div id="main-content" tabIndex={-1} className="dashboard-main flex-1 p-6 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
