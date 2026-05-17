import type { Role } from '@/lib/auth/roles';

export type TabDef = {
  href: string;
  label: string;
  /** Translation key under `messages.account` (e.g. `tabProfile`). */
  labelKey: string;
  visibleFor: Role[];
};

export const TABS: TabDef[] = [
  {
    href: '/account',
    label: 'Profile',
    labelKey: 'tabProfile',
    visibleFor: ['super_admin', 'admin', 'pro', 'customer', 'employee'],
  },
  {
    href: '/account/security',
    label: 'Security',
    labelKey: 'tabSecurity',
    visibleFor: ['super_admin', 'admin', 'pro', 'customer', 'employee'],
  },
  {
    href: '/account/role',
    label: 'Role details',
    labelKey: 'tabRoleDetails',
    visibleFor: ['pro', 'customer', 'employee'],
  },
];

export function visibleTabs(role: Role): TabDef[] {
  return TABS.filter((t) => t.visibleFor.includes(role));
}
