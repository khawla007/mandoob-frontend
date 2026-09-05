import { adminNav } from './nav-admin';
import { buildCustomerNav } from './nav-customer';
import { buildEmployeeNav } from './nav-employee';
import { buildProNav } from './nav-pro';
import type { ShellNavGroup, ShellNavItem } from './nav-config';

export type DashboardNavKind = 'admin' | 'pro' | 'customer' | 'employee';

export type DashboardCommandEntry = {
  label: string;
  group: string;
  href: string;
  icon?: ShellNavItem['icon'];
};

export function resolveDashboardNav(kind: DashboardNavKind, slug = ''): ShellNavGroup[] {
  switch (kind) {
    case 'admin':
      return adminNav;
    case 'pro':
      return buildProNav(slug);
    case 'customer':
      return buildCustomerNav(slug);
    case 'employee':
      return buildEmployeeNav(slug);
  }
}

export function buildDashboardCommandEntries(
  groups: ShellNavGroup[],
  translate: (key: string | undefined, fallback: string | undefined) => string,
): DashboardCommandEntry[] {
  return groups.flatMap((group) => {
    const groupLabel = translate(group.labelKey, group.labelFallback);
    return group.items.flatMap((item) =>
      [item, ...(item.children ?? [])].map((entry) => ({
        label: translate(entry.labelKey, entry.labelFallback),
        group: groupLabel,
        href: entry.href,
        icon: entry.icon,
      })),
    );
  });
}
