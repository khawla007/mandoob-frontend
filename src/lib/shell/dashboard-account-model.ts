import type { DashboardNavKind } from './dashboard-navigation-model';

export type DashboardAccountLink = {
  labelKey: 'profile' | 'settings' | 'security' | 'sessions' | 'privacy';
  href: string;
};

export function buildDashboardAccountLinks(
  kind: DashboardNavKind,
  slug = '',
): DashboardAccountLink[] {
  const safeSlug = encodeURIComponent(slug);
  switch (kind) {
    case 'admin':
      return [
        { labelKey: 'settings', href: '/admin/settings' },
        { labelKey: 'security', href: '/admin/security' },
      ];
    case 'pro':
      return [
        { labelKey: 'settings', href: `/t/${safeSlug}/settings` },
        { labelKey: 'security', href: '/account/security' },
        { labelKey: 'sessions', href: '/account/sessions' },
      ];
    case 'customer':
      return [
        { labelKey: 'profile', href: '/account' },
        { labelKey: 'security', href: '/account/security' },
        { labelKey: 'privacy', href: `/t/${safeSlug}/portal/account/erasure` },
      ];
    case 'employee':
      return [
        { labelKey: 'settings', href: `/t/${safeSlug}/employee/settings` },
        { labelKey: 'security', href: `/t/${safeSlug}/employee/settings/security` },
      ];
  }
}
